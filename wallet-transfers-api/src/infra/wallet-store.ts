import type { FxQuote } from "../domain/fx-quote.js";
import type { LedgerEntry } from "../domain/ledger-entry.entity.js";
import type { TransferSnapshot } from "../domain/transfer.entity.js";
import type { Wallet } from "../domain/wallet.entity.js";

export interface IdempotencyRecord {
    key: string;
    payload: string;
    result: unknown;
}

export interface TransactionContext {
    getWallet(id: string, forUpdate?: boolean): Promise<Wallet | undefined>;
    saveWallet(wallet: Wallet): Promise<void>;
    getQuote(id: string): Promise<FxQuote | undefined>;
    saveQuote(quote: FxQuote): Promise<void>;
    getIdempotency(key: string): Promise<IdempotencyRecord | undefined>;
    saveIdempotency(record: IdempotencyRecord): Promise<void>;
    saveTransfer(transfer: TransferSnapshot): Promise<void>;
    appendLedger(entries: readonly LedgerEntry[]): Promise<void>;
}

export interface WalletStore {
    transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
    getIdempotency(key: string): Promise<IdempotencyRecord | undefined>;
    getWallet(id: string): Promise<Wallet | undefined>;
    getTransfer(id: string): Promise<TransferSnapshot | undefined>;
    getLedgerEntries(transferId: string): Promise<readonly LedgerEntry[]>;
    seedWallet(wallet: Wallet): Promise<void>;
    seedQuote(quote: FxQuote): Promise<void>;
}
