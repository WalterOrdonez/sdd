import { DomainError } from "../domain/errors.js";
import type { FxQuote } from "../domain/fx-quote.js";
import type { LedgerEntry } from "../domain/ledger-entry.entity.js";
import type { TransferSnapshot } from "../domain/transfer.entity.js";
import { Wallet, type WalletSnapshot } from "../domain/wallet.entity.js";
import type {
    IdempotencyRecord,
    TransactionContext,
    WalletStore,
} from "./wallet-store.js";

interface MemoryState {
    wallets: Map<string, WalletSnapshot>;
    quotes: Map<string, FxQuote>;
    idempotency: Map<string, IdempotencyRecord>;
    transfers: Map<string, TransferSnapshot>;
    ledger: LedgerEntry[];
}

function cloneState(state: MemoryState): MemoryState {
    return {
        wallets: new Map(
            [...state.wallets].map(([key, value]) => [key, { ...value }]),
        ),
        quotes: new Map(
            [...state.quotes].map(([key, value]) => [key, { ...value }]),
        ),
        idempotency: new Map(
            [...state.idempotency].map(([key, value]) => [
                key,
                { ...value },
            ]),
        ),
        transfers: new Map(
            [...state.transfers].map(([key, value]) => [key, { ...value }]),
        ),
        ledger: [...state.ledger],
    };
}

class MemoryTransaction implements TransactionContext {
    constructor(private readonly state: MemoryState) {}

    async getWallet(id: string): Promise<Wallet | undefined> {
        const snapshot = this.state.wallets.get(id);
        return snapshot ? new Wallet({ ...snapshot }) : undefined;
    }

    async saveWallet(wallet: Wallet): Promise<void> {
        this.state.wallets.set(wallet.id, wallet.snapshot());
    }

    async getQuote(id: string): Promise<FxQuote | undefined> {
        const quote = this.state.quotes.get(id);
        return quote ? { ...quote } : undefined;
    }

    async saveQuote(quote: FxQuote): Promise<void> {
        this.state.quotes.set(quote.quoteId, { ...quote });
    }

    async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
        const record = this.state.idempotency.get(key);
        return record ? { ...record } : undefined;
    }

    async saveIdempotency(record: IdempotencyRecord): Promise<void> {
        if (this.state.idempotency.has(record.key)) {
            throw new DomainError("IDEMPOTENCY_CONFLICT", "La clave ya fue utilizada.");
        }
        this.state.idempotency.set(record.key, { ...record });
    }

    async saveTransfer(transfer: TransferSnapshot): Promise<void> {
        this.state.transfers.set(transfer.id, { ...transfer });
    }

    async appendLedger(entries: readonly LedgerEntry[]): Promise<void> {
        this.state.ledger.push(...entries);
    }
}

export class MemoryWalletStore implements WalletStore {
    private state: MemoryState = {
        wallets: new Map(),
        quotes: new Map(),
        idempotency: new Map(),
        transfers: new Map(),
        ledger: [],
    };
    private tail: Promise<void> = Promise.resolve();

    async transaction<T>(
        work: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        const draft = cloneState(this.state);
        try {
            const result = await work(new MemoryTransaction(draft));
            this.state = draft;
            return result;
        } finally {
            release();
        }
    }

    async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
        const result = this.state.idempotency.get(key);
        return result ? { ...result } : undefined;
    }

    async getWallet(id: string): Promise<Wallet | undefined> {
        const snapshot = this.state.wallets.get(id);
        return snapshot ? new Wallet({ ...snapshot }) : undefined;
    }

    async getTransfer(id: string): Promise<TransferSnapshot | undefined> {
        const transfer = this.state.transfers.get(id);
        return transfer ? { ...transfer } : undefined;
    }

    async getLedgerEntries(transferId: string): Promise<readonly LedgerEntry[]> {
        return this.state.ledger
            .filter((entry) => entry.transferId === transferId)
            .map((entry) => ({ ...entry }));
    }

    async seedWallet(wallet: Wallet): Promise<void> {
        await this.transaction(async (tx) => {
            if (await tx.getWallet(wallet.id)) {
                throw new Error(`Wallet ${wallet.id} already exists.`);
            }
            await tx.saveWallet(wallet);
        });
    }

    async seedQuote(quote: FxQuote): Promise<void> {
        await this.transaction((tx) => tx.saveQuote(quote));
    }
}
