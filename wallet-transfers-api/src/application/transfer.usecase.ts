import { randomUUID } from "node:crypto";
import { holdBalance } from "../domain/balance-lock.js";
import { validateCurrency } from "../domain/currency.validator.js";
import { DomainError } from "../domain/errors.js";
import { createLedgerEntries } from "../domain/ledger.js";
import { assertPositiveAmountMinor, createMoney } from "../domain/money.js";
import { Transfer } from "../domain/transfer.entity.js";
import { Wallet } from "../domain/wallet.entity.js";
import type { WalletStore } from "../infra/wallet-store.js";

export interface TransferRequest {
    fromWalletId: string;
    toWalletId: string;
    amountMinor: number;
    currency: unknown;
}

export interface TransferResult {
    transferId: string;
    status: "COMPLETADA";
    fromBalanceMinor: number;
    toBalanceMinor: number;
}

function payloadOf(request: TransferRequest): string {
    return JSON.stringify({
        fromWalletId: request.fromWalletId,
        toWalletId: request.toWalletId,
        amountMinor: request.amountMinor,
        currency: request.currency,
    });
}

function isTransferResult(value: unknown): value is TransferResult {
    if (typeof value !== "object" || value === null) return false;
    const result = value as Record<string, unknown>;
    return (
        typeof result.transferId === "string" &&
        result.status === "COMPLETADA" &&
        Number.isSafeInteger(result.fromBalanceMinor) &&
        Number.isSafeInteger(result.toBalanceMinor)
    );
}

function isDuplicateKeyError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const record = error as Record<string, unknown>;
    return record.code === "ER_DUP_ENTRY" || record.errno === 1062;
}

export class TransferUseCase {
    constructor(
        private readonly store: WalletStore,
        private readonly now: () => number = Date.now,
    ) {}

    async execute(
        request: TransferRequest,
        idempotencyKey: string,
    ): Promise<TransferResult> {
        const amountMinor = assertPositiveAmountMinor(request.amountMinor);
        const money = createMoney(amountMinor, validateCurrency(request.currency));
        if (!request.fromWalletId || !request.toWalletId) {
            throw new DomainError("INVALID_REQUEST", "Las billeteras son obligatorias.");
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
        let operationTransferId: string | undefined;
        try {
            return await this.store.transaction(async (tx) => {
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
                if (
                    from.currency !== money.currency ||
                    to.currency !== money.currency
                ) {
                    throw new DomainError(
                        "CURRENCY_MISMATCH",
                        "Las billeteras y la solicitud deben usar la misma moneda.",
                    );
                }
                const previous = await tx.getIdempotency(idempotencyKey);
                if (previous) {
                    if (previous.payload !== payload) {
                        throw new DomainError(
                            "IDEMPOTENCY_CONFLICT",
                            "La clave ya se usó con otra solicitud.",
                        );
                    }
                    if (!isTransferResult(previous.result)) {
                        throw new DomainError("INTERNAL", "Resultado idempotente inválido.");
                    }
                    return previous.result;
                }

                holdBalance(from, money.amountMinor);
                const transferId = randomUUID();
                operationTransferId = transferId;
                const entries = createLedgerEntries(
                    transferId,
                    [
                        {
                            account: `wallet:${from.id}`,
                            amountMinor: -money.amountMinor,
                            currency: money.currency,
                        },
                        {
                            account: `wallet:${to.id}`,
                            amountMinor: money.amountMinor,
                            currency: money.currency,
                        },
                    ],
                    this.now(),
                );
                from.debitHeld(money.amountMinor);
                to.credit(money.amountMinor);
                await tx.saveWallet(from);
                await tx.saveWallet(to);
                await tx.appendLedger(entries);
                const transfer = new Transfer({
                    id: transferId,
                    fromWalletId: from.id,
                    toWalletId: to.id,
                    debitedMinor: money.amountMinor,
                    creditedMinor: money.amountMinor,
                    fromCurrency: money.currency,
                    toCurrency: money.currency,
                    status: "COMPLETADA",
                    createdAt: this.now(),
                });
                await tx.saveTransfer(transfer.snapshot());
                const result: TransferResult = {
                    transferId,
                    status: "COMPLETADA",
                    fromBalanceMinor: from.availableMinor,
                    toBalanceMinor: to.availableMinor,
                };
                await tx.saveIdempotency({
                    key: idempotencyKey,
                    payload,
                    result,
                });
                return result;
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                const previous = await this.store.getIdempotency(idempotencyKey);
                if (!previous) throw error;
                if (previous.payload !== payload) {
                    throw new DomainError(
                        "IDEMPOTENCY_CONFLICT",
                        "La clave ya se usó con otra solicitud.",
                    );
                }
                if (!isTransferResult(previous.result)) {
                    throw new DomainError(
                        "INTERNAL",
                        "La transferencia no pudo completarse y fue registrada.",
                    );
                }
                return previous.result;
            }
            const failedTransferId = operationTransferId;
            if (
                failedTransferId &&
                (!(error instanceof DomainError) || error.code === "INTERNAL")
            ) {
                try {
                    await this.store.transaction(async (tx) => {
                        const existing = await tx.getIdempotency(idempotencyKey);
                        if (existing) return;
                        await tx.saveTransfer({
                            id: failedTransferId,
                            fromWalletId: request.fromWalletId,
                            toWalletId: request.toWalletId,
                            debitedMinor: money.amountMinor,
                            creditedMinor: money.amountMinor,
                            fromCurrency: money.currency,
                            toCurrency: money.currency,
                            status: "FALLIDA",
                            createdAt: this.now(),
                            failureReason:
                                "La transacción se revirtió antes de completar la transferencia.",
                        });
                        await tx.saveIdempotency({
                            key: idempotencyKey,
                            payload,
                            result: {
                                code: "INTERNAL",
                                message: "La transferencia no pudo completarse.",
                            },
                        });
                    });
                } catch {
                    throw new DomainError(
                        "INTERNAL",
                        "No fue posible registrar el estado fallido de la transferencia.",
                    );
                }
            }
            throw error;
        }
    }
}
