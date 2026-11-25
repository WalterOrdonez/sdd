import { randomUUID } from "node:crypto";
import { holdBalance, unlockBalance } from "../domain/balance-lock.js";
import { convertMinor, createFxLedgerEntries } from "../domain/fx-conversion.js";
import { assertQuoteValid } from "../domain/fx-quote.js";
import { validateCurrency } from "../domain/currency.validator.js";
import { DomainError } from "../domain/errors.js";
import { createReversalEntries } from "../domain/ledger.js";
import { Transfer } from "../domain/transfer.entity.js";
import { Wallet } from "../domain/wallet.entity.js";
import type { WalletStore } from "../infra/wallet-store.js";
import { TransferSaga, type SagaStep } from "./transfer-saga.js";

export interface FxTransferRequest {
    fromWalletId: string;
    toWalletId: string;
    amountMinor: number;
    quoteId: string;
}

export interface FxTransferResult {
    transferId: string;
    status: "COMPLETADA";
    debitedMinor: number;
    creditedMinor: number;
    rate: number;
}

interface FxTransferFailure {
    transferId: string;
    status: "COMPENSADA" | "FALLIDA";
    debitedMinor: number;
    creditedMinor: number;
    rate: number;
}

type StoredFxTransferResult = FxTransferResult | FxTransferFailure;

function payloadOf(request: FxTransferRequest): string {
    return JSON.stringify({
        fromWalletId: request.fromWalletId,
        toWalletId: request.toWalletId,
        amountMinor: request.amountMinor,
        quoteId: request.quoteId,
    });
}

function isStoredFxTransferResult(value: unknown): value is StoredFxTransferResult {
    if (typeof value !== "object" || value === null) return false;
    const result = value as Record<string, unknown>;
    return (
        typeof result.transferId === "string" &&
        (result.status === "COMPLETADA" ||
            result.status === "COMPENSADA" ||
            result.status === "FALLIDA") &&
        Number.isSafeInteger(result.debitedMinor) &&
        Number.isSafeInteger(result.creditedMinor) &&
        typeof result.rate === "number"
    );
}

function isDuplicateKeyError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const record = error as Record<string, unknown>;
    return record.code === "ER_DUP_ENTRY" || record.errno === 1062;
}

export class FxTransferUseCase {
    constructor(
        private readonly store: WalletStore,
        private readonly saga = new TransferSaga(),
        private readonly now: () => number = Date.now,
    ) {}

    async execute(
        request: FxTransferRequest,
        idempotencyKey: string,
    ): Promise<FxTransferResult> {
        if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) {
            throw new DomainError("INVALID_AMOUNT", "El monto debe ser mayor que cero.");
        }
        const amountMinor = request.amountMinor;
        if (!request.fromWalletId || !request.toWalletId || !request.quoteId) {
            throw new DomainError("INVALID_REQUEST", "Billeteras y quoteId son obligatorios.");
        }
        if (request.fromWalletId === request.toWalletId) {
            throw new DomainError("SAME_WALLET", "El origen y el destino deben ser distintos.");
        }
        if (!idempotencyKey.trim() || idempotencyKey.length > 255) {
            throw new DomainError(
                "INVALID_REQUEST",
                "Idempotency-Key es obligatorio y no puede superar 255 caracteres.",
            );
        }
        const payload = payloadOf(request);
        try {
            const result = await this.store.transaction<StoredFxTransferResult>(async (tx) => {
                const previous = await tx.getIdempotency(idempotencyKey);
                if (previous) {
                    if (previous.payload !== payload) {
                        throw new DomainError(
                            "IDEMPOTENCY_CONFLICT",
                            "La clave ya se usó con otra solicitud.",
                        );
                    }
                    if (!isStoredFxTransferResult(previous.result)) {
                        throw new DomainError("INTERNAL", "Resultado idempotente inválido.");
                    }
                    return previous.result;
                }

                const ids = [request.fromWalletId, request.toWalletId].sort();
                const locked = new Map<string, Wallet>();
                for (const id of ids) {
                    const wallet = await tx.getWallet(id, true);
                    if (!wallet?.active) {
                        throw new DomainError(
                            "WALLET_NOT_FOUND",
                            "Una de las billeteras no existe o no está activa.",
                        );
                    }
                    locked.set(id, wallet);
                }
                const from = locked.get(request.fromWalletId);
                const to = locked.get(request.toWalletId);
                if (!from || !to) {
                    throw new DomainError("WALLET_NOT_FOUND", "La billetera no existe.");
                }
                const quote = await tx.getQuote(request.quoteId);
                if (!quote) {
                    throw new DomainError("QUOTE_EXPIRED", "La cotización no existe o expiró.");
                }
                const sourceCurrency = validateCurrency(from.currency);
                const destinationCurrency = validateCurrency(to.currency);
                if (sourceCurrency === destinationCurrency) {
                    throw new DomainError(
                        "CURRENCY_MISMATCH",
                        "La transferencia FX requiere monedas distintas.",
                    );
                }
                if (quote.from !== sourceCurrency || quote.to !== destinationCurrency) {
                    throw new DomainError(
                        "CURRENCY_MISMATCH",
                        "La cotización no corresponde a las monedas de las billeteras.",
                    );
                }
                if (from.availableMinor < amountMinor) {
                    throw new DomainError(
                        "INSUFFICIENT_FUNDS",
                        "El saldo disponible es insuficiente.",
                    );
                }
                assertQuoteValid(quote, this.now());
                const creditedMinor = convertMinor(amountMinor, quote.rate);
                const transferId = randomUUID();
                const ledgerEntries = createFxLedgerEntries(
                    transferId,
                    from.id,
                    to.id,
                    amountMinor,
                    creditedMinor,
                    quote,
                    this.now(),
                );
                let lockActive = false;
                let ledgerActive = false;
                let debitActive = false;
                let creditActive = false;
                let holdCompensated = false;
                let ledgerCompensated = false;
                let debitCompensated = false;
                let creditCompensated = false;

                const steps: SagaStep[] = [
                    {
                        name: "hold",
                        execute: async () => {
                            holdBalance(from, amountMinor);
                            lockActive = true;
                            await tx.saveWallet(from);
                        },
                        compensate: async () => {
                            if (lockActive && !holdCompensated) {
                                unlockBalance(from, amountMinor);
                                await tx.saveWallet(from);
                                holdCompensated = true;
                            }
                        },
                    },
                    {
                        name: "ledger",
                        execute: async () => {
                            await tx.appendLedger(ledgerEntries);
                            ledgerActive = true;
                        },
                        compensate: async () => {
                            if (ledgerActive && !ledgerCompensated) {
                                await tx.appendLedger(createReversalEntries(ledgerEntries, this.now()));
                                ledgerCompensated = true;
                            }
                        },
                    },
                    {
                        name: "debit",
                        execute: async () => {
                            from.debitHeld(amountMinor);
                            debitActive = true;
                            await tx.saveWallet(from);
                        },
                        compensate: async () => {
                            if (debitActive && !debitCompensated) {
                                from.restoreHeldDebit(amountMinor);
                                await tx.saveWallet(from);
                                debitCompensated = true;
                            }
                        },
                    },
                    {
                        name: "credit",
                        execute: async () => {
                            to.credit(creditedMinor);
                            creditActive = true;
                            await tx.saveWallet(to);
                        },
                        compensate: async () => {
                            if (creditActive && !creditCompensated) {
                                to.debit(creditedMinor);
                                await tx.saveWallet(to);
                                creditCompensated = true;
                            }
                        },
                    },
                ];
                const sagaResult = await this.saga.execute(steps);
                const status = sagaResult.status;
                const transfer = new Transfer({
                    id: transferId,
                    fromWalletId: from.id,
                    toWalletId: to.id,
                    debitedMinor: amountMinor,
                    creditedMinor,
                    fromCurrency: sourceCurrency,
                    toCurrency: destinationCurrency,
                    status,
                    createdAt: this.now(),
                    ...(status === "FALLIDA"
                        ? {
                              failureReason:
                                  "Compensación incompleta; requiere intervención manual.",
                          }
                        : {}),
                });
                await tx.saveTransfer(transfer.snapshot());

                if (status !== "COMPLETADA") {
                    const failureResult: FxTransferFailure = {
                        transferId,
                        status,
                        debitedMinor: amountMinor,
                        creditedMinor,
                        rate: quote.rate,
                    };
                    await tx.saveIdempotency({
                        key: idempotencyKey,
                        payload,
                        result: failureResult,
                    });
                    return failureResult;
                }

                const success: FxTransferResult = {
                    transferId,
                    status: "COMPLETADA",
                    debitedMinor: amountMinor,
                    creditedMinor,
                    rate: quote.rate,
                };
                await tx.saveIdempotency({ key: idempotencyKey, payload, result: success });
                return success;
            });
            if (result.status !== "COMPLETADA") {
                throw new DomainError(
                    "INTERNAL",
                    "La transferencia no pudo completarse y fue registrada para seguimiento.",
                );
            }
            return result;
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            const previous = await this.store.getIdempotency(idempotencyKey);
            if (!previous) throw error;
            if (previous.payload !== payload) {
                throw new DomainError(
                    "IDEMPOTENCY_CONFLICT",
                    "La clave ya se usó con otra solicitud.",
                );
            }
            if (!isStoredFxTransferResult(previous.result)) {
                throw new DomainError("INTERNAL", "Resultado idempotente inválido.");
            }
            if (previous.result.status !== "COMPLETADA") {
                throw new DomainError(
                    "INTERNAL",
                    "La transferencia no pudo completarse y fue registrada para seguimiento.",
                );
            }
            return previous.result;
        }
    }
}
