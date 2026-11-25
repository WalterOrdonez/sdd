import type { DataSource, QueryRunner } from "typeorm";
import { DomainError } from "../domain/errors.js";
import type { FxQuote } from "../domain/fx-quote.js";
import type { LedgerEntry } from "../domain/ledger-entry.entity.js";
import type { Currency } from "../domain/money.js";
import type { TransferSnapshot } from "../domain/transfer.entity.js";
import { Wallet, type WalletSnapshot } from "../domain/wallet.entity.js";
import type {
    IdempotencyRecord,
    TransactionContext,
    WalletStore,
} from "./wallet-store.js";
import { executeInQueryRunner } from "./unit-of-work.js";

type DbRow = Record<string, unknown>;

function isRecord(value: unknown): value is DbRow {
    return typeof value === "object" && value !== null;
}

function rows(value: unknown): DbRow[] {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberField(row: DbRow, key: string): number {
    const value = Number(row[key]);
    if (!Number.isSafeInteger(value)) {
        throw new DomainError("INTERNAL", "Se encontró un valor inválido en almacenamiento.");
    }
    return value;
}

function stringField(row: DbRow, key: string): string {
    const value = row[key];
    if (typeof value !== "string") {
        throw new DomainError("INTERNAL", "Se encontró un valor inválido en almacenamiento.");
    }
    return value;
}

function booleanField(row: DbRow, key: string): boolean {
    const value = row[key];
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
    throw new DomainError("INTERNAL", "Se encontró un valor inválido en almacenamiento.");
}

function parseJson(value: unknown): unknown {
    if (typeof value === "string") return JSON.parse(value) as unknown;
    return value;
}

class MysqlTransactionContext implements TransactionContext {
    constructor(private readonly runner: QueryRunner) {}

    async getWallet(id: string, forUpdate = false): Promise<Wallet | undefined> {
        const lock = forUpdate ? " FOR UPDATE" : "";
        const result: unknown = await this.runner.query(
            `SELECT id, currency, balance_minor, locked_minor, active FROM wallets WHERE id = ?${lock}`,
            [id],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        const snapshot: WalletSnapshot = {
            id: stringField(row, "id"),
            currency: stringField(row, "currency") as Currency,
            balanceMinor: numberField(row, "balance_minor"),
            lockedMinor: numberField(row, "locked_minor"),
            active: booleanField(row, "active"),
        };
        return new Wallet(snapshot);
    }

    async saveWallet(wallet: Wallet): Promise<void> {
        const state = wallet.snapshot();
        await this.runner.query(
            "UPDATE wallets SET balance_minor = ?, locked_minor = ?, active = ? WHERE id = ?",
            [state.balanceMinor, state.lockedMinor, state.active, state.id],
        );
    }

    async getQuote(id: string): Promise<FxQuote | undefined> {
        const result: unknown = await this.runner.query(
            "SELECT quote_id, from_currency, to_currency, rate, issued_at, expires_at FROM fx_quotes WHERE quote_id = ?",
            [id],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        return {
            quoteId: stringField(row, "quote_id"),
            from: stringField(row, "from_currency") as Currency,
            to: stringField(row, "to_currency") as Currency,
            rate: Number(row.rate),
            issuedAt: numberField(row, "issued_at"),
            expiresAt: numberField(row, "expires_at"),
        };
    }

    async saveQuote(quote: FxQuote): Promise<void> {
        await this.runner.query(
            "INSERT INTO fx_quotes (quote_id, from_currency, to_currency, rate, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            [quote.quoteId, quote.from, quote.to, quote.rate, quote.issuedAt, quote.expiresAt],
        );
    }

    async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
        const result: unknown = await this.runner.query(
            "SELECT `key`, payload, result FROM idempotency_keys WHERE `key` = ?",
            [key],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        const payload = row.payload;
        const response = parseJson(row.result);
        if (typeof payload !== "string") {
            throw new DomainError("INTERNAL", "Registro de idempotencia inválido.");
        }
        return { key, payload, result: response };
    }

    async saveIdempotency(record: IdempotencyRecord): Promise<void> {
        await this.runner.query(
            "INSERT INTO idempotency_keys (`key`, payload, result, created_at) VALUES (?, ?, ?, ?)",
            [record.key, record.payload, JSON.stringify(record.result), Date.now()],
        );
    }

    async saveTransfer(transfer: TransferSnapshot): Promise<void> {
        await this.runner.query(
            `INSERT INTO transfers
                (id, from_wallet_id, to_wallet_id, debited_minor, credited_minor, from_currency, to_currency, status, created_at, failure_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), failure_reason = VALUES(failure_reason)`,
            [
                transfer.id,
                transfer.fromWalletId,
                transfer.toWalletId,
                transfer.debitedMinor,
                transfer.creditedMinor,
                transfer.fromCurrency,
                transfer.toCurrency,
                transfer.status,
                transfer.createdAt,
                transfer.failureReason ?? null,
            ],
        );
    }

    async appendLedger(entries: readonly LedgerEntry[]): Promise<void> {
        if (entries.length === 0) return;
        const values = entries.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const parameters = entries.flatMap((entry) => [
            entry.id,
            entry.transferId,
            entry.account,
            entry.amountMinor,
            entry.currency,
            entry.roundingResidual?.numerator ?? null,
            entry.roundingResidual?.denominator ?? null,
            entry.reversesEntryId ?? null,
            entry.createdAt,
        ]);
        await this.runner.query(
            `INSERT INTO ledger_entries
                (id, transfer_id, account, amount_minor, currency, rounding_residual_numerator,
                 rounding_residual_denominator, reverses_entry_id, created_at)
             VALUES ${values}`,
            parameters,
        );
    }
}

export class MysqlWalletStore implements WalletStore {
    constructor(private readonly dataSource: DataSource) {}

    async transaction<T>(
        work: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> {
        const runner = this.dataSource.createQueryRunner();
        return executeInQueryRunner(
            runner,
            work,
            (queryRunner) => new MysqlTransactionContext(queryRunner),
        );
    }

    async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
        const result: unknown = await this.dataSource.manager.query(
            "SELECT `key`, payload, result FROM idempotency_keys WHERE `key` = ?",
            [key],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        const payload = row.payload;
        if (typeof payload !== "string") {
            throw new DomainError("INTERNAL", "Registro de idempotencia inválido.");
        }
        return {
            key,
            payload,
            result: parseJson(row.result),
        };
    }

    async getWallet(id: string): Promise<Wallet | undefined> {
        const result: unknown = await this.dataSource.manager.query(
            "SELECT id, currency, balance_minor, locked_minor, active FROM wallets WHERE id = ?",
            [id],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        return new Wallet({
            id: stringField(row, "id"),
            currency: stringField(row, "currency") as Currency,
            balanceMinor: numberField(row, "balance_minor"),
            lockedMinor: numberField(row, "locked_minor"),
            active: booleanField(row, "active"),
        });
    }

    async getTransfer(id: string): Promise<TransferSnapshot | undefined> {
        const result: unknown = await this.dataSource.manager.query(
            `SELECT id, from_wallet_id, to_wallet_id, debited_minor, credited_minor,
                    from_currency, to_currency, status, created_at, failure_reason
             FROM transfers WHERE id = ?`,
            [id],
        );
        const row = rows(result)[0];
        if (!row) return undefined;
        const status = stringField(row, "status");
        if (
            status !== "PENDIENTE" &&
            status !== "COMPLETADA" &&
            status !== "RECHAZADA" &&
            status !== "COMPENSADA" &&
            status !== "FALLIDA"
        ) {
            throw new DomainError("INTERNAL", "Estado de transferencia inválido.");
        }
        return {
            id: stringField(row, "id"),
            fromWalletId: stringField(row, "from_wallet_id"),
            toWalletId: stringField(row, "to_wallet_id"),
            debitedMinor: numberField(row, "debited_minor"),
            creditedMinor: numberField(row, "credited_minor"),
            fromCurrency: stringField(row, "from_currency") as Currency,
            toCurrency: stringField(row, "to_currency") as Currency,
            status,
            createdAt: numberField(row, "created_at"),
            ...(typeof row.failure_reason === "string"
                ? { failureReason: row.failure_reason }
                : {}),
        };
    }

    async getLedgerEntries(transferId: string): Promise<readonly LedgerEntry[]> {
        const result: unknown = await this.dataSource.manager.query(
            `SELECT id, transfer_id, account, amount_minor, currency,
                    rounding_residual_numerator, rounding_residual_denominator,
                    reverses_entry_id, created_at
             FROM ledger_entries WHERE transfer_id = ? ORDER BY created_at, id`,
            [transferId],
        );
        return rows(result).map((row) => {
            const reversal = row.reverses_entry_id;
            const residualNumerator = row.rounding_residual_numerator;
            const residualDenominator = row.rounding_residual_denominator;
            if (
                (residualNumerator === null) !== (residualDenominator === null) ||
                (residualNumerator !== null && typeof residualNumerator !== "string") ||
                (residualDenominator !== null && typeof residualDenominator !== "string")
            ) {
                throw new DomainError("INTERNAL", "Residuo de redondeo contable inválido.");
            }
            return {
                id: stringField(row, "id"),
                transferId: stringField(row, "transfer_id"),
                account: stringField(row, "account"),
                amountMinor: numberField(row, "amount_minor"),
                currency: stringField(row, "currency") as Currency,
                ...(typeof residualNumerator === "string" &&
                typeof residualDenominator === "string"
                    ? {
                          roundingResidual: {
                              numerator: residualNumerator,
                              denominator: residualDenominator,
                          },
                      }
                    : {}),
                ...(typeof reversal === "string" ? { reversesEntryId: reversal } : {}),
                createdAt: numberField(row, "created_at"),
            };
        });
    }

    async seedWallet(wallet: Wallet): Promise<void> {
        const snapshot = wallet.snapshot();
        await this.dataSource.manager.query(
            "INSERT INTO wallets (id, currency, balance_minor, locked_minor, active) VALUES (?, ?, ?, ?, ?)",
            [
                snapshot.id,
                snapshot.currency,
                snapshot.balanceMinor,
                snapshot.lockedMinor,
                snapshot.active,
            ],
        );
    }

    async seedQuote(quote: FxQuote): Promise<void> {
        await this.transaction((tx) => tx.saveQuote(quote));
    }
}
