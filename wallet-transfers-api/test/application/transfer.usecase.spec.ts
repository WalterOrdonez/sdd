import { describe, expect, it } from "vitest";
import { TransferUseCase } from "../../src/application/transfer.usecase.js";
import { Wallet } from "../../src/domain/wallet.entity.js";
import { makeSameCurrencyStore } from "../helpers.js";
import { MemoryWalletStore } from "../../src/infra/memory-wallet-store.js";
import type { TransactionContext } from "../../src/infra/wallet-store.js";

class FailLedgerStore extends MemoryWalletStore {
    private shouldFail = true;
    failedTransferId: string | undefined;

    override transaction<T>(
        work: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> {
        return super.transaction((tx) =>
            work({
                getWallet: (id, forUpdate) => tx.getWallet(id, forUpdate),
                saveWallet: (wallet) => tx.saveWallet(wallet),
                getQuote: (id) => tx.getQuote(id),
                saveQuote: (quote) => tx.saveQuote(quote),
                getIdempotency: (key) => tx.getIdempotency(key),
                saveIdempotency: (record) => tx.saveIdempotency(record),
                saveTransfer: (transfer) => {
                    if (transfer.status === "FALLIDA") {
                        this.failedTransferId = transfer.id;
                    }
                    return tx.saveTransfer(transfer);
                },
                appendLedger: async (entries) => {
                    if (this.shouldFail) {
                        this.shouldFail = false;
                        throw new Error("ledger unavailable");
                    }
                    await tx.appendLedger(entries);
                },
            }),
        );
    }
}

describe("TransferUseCase", () => {
    it("moves funds atomically and returns the original response on retry", async () => {
        const store = await makeSameCurrencyStore();
        const useCase = new TransferUseCase(store, () => 123);
        const request = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-DESTINO",
            amountMinor: 3000,
            currency: "USD",
        };
        const first = await useCase.execute(request, "KEY-1");
        const retry = await useCase.execute(request, "KEY-1");
        expect(retry).toEqual(first);
        expect((await store.getWallet("W-ORIGEN"))?.availableMinor).toBe(7000);
        expect((await store.getWallet("W-DESTINO"))?.availableMinor).toBe(3000);
        expect(await store.getLedgerEntries(first.transferId)).toHaveLength(2);
    });

    it("rejects a different payload under the same idempotency key", async () => {
        const store = await makeSameCurrencyStore();
        const useCase = new TransferUseCase(store);
        const request = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-DESTINO",
            amountMinor: 1000,
            currency: "USD",
        };
        await useCase.execute(request, "KEY-1");
        await expect(
            useCase.execute({ ...request, amountMinor: 2000 }, "KEY-1"),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    });

    it("rejects insufficient funds without changing balances or ledger", async () => {
        const store = await makeSameCurrencyStore();
        const useCase = new TransferUseCase(store);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-DESTINO",
                    amountMinor: 15_000,
                    currency: "USD",
                },
                "KEY-2",
            ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(10_000);
        expect((await store.getWallet("W-ORIGEN"))?.lockedMinor).toBe(0);
        expect(await store.getLedgerEntries("missing")).toHaveLength(0);
    });

    it("rejects missing wallets and cross-currency requests", async () => {
        const store = await makeSameCurrencyStore();
        await store.seedWallet(
            new Wallet({
                id: "W-EUR",
                currency: "EUR",
                balanceMinor: 0,
                lockedMinor: 0,
                active: true,
            }),
        );
        const useCase = new TransferUseCase(store);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-NO-EXISTE",
                    amountMinor: 100,
                    currency: "USD",
                },
                "KEY-3",
            ),
        ).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-EUR",
                    amountMinor: 100,
                    currency: "USD",
                },
                "KEY-4",
            ),
        ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    });

    it("serializes concurrent transfer attempts against the same wallet", async () => {
        const store = await makeSameCurrencyStore();
        const useCase = new TransferUseCase(store);
        const execute = (key: string) =>
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-DESTINO",
                    amountMinor: 6000,
                    currency: "USD",
                },
                key,
            );
        const results = await Promise.allSettled([execute("K-1"), execute("K-2")]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(4000);
        expect((await store.getWallet("W-DESTINO"))?.balanceMinor).toBe(6000);
    });

    it("rolls back both balances when ledger registration fails", async () => {
        const initial = await makeSameCurrencyStore();
        const store = new FailLedgerStore();
        for (const id of ["W-ORIGEN", "W-DESTINO"]) {
            const wallet = await initial.getWallet(id);
            if (wallet) await store.seedWallet(wallet);
        }
        const useCase = new TransferUseCase(store);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-DESTINO",
                    amountMinor: 3000,
                    currency: "USD",
                },
                "LEDGER-FAIL",
            ),
        ).rejects.toThrow("ledger unavailable");
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(10_000);
        expect((await store.getWallet("W-ORIGEN"))?.lockedMinor).toBe(0);
        expect((await store.getWallet("W-DESTINO"))?.balanceMinor).toBe(0);
        const failedTransferId = store.failedTransferId;
        if (!failedTransferId) throw new Error("Failed transfer was not recorded.");
        expect(await store.getTransfer(failedTransferId)).toMatchObject({
            status: "FALLIDA",
            failureReason:
                "La transacción se revirtió antes de completar la transferencia.",
        });
        expect(await store.getLedgerEntries(failedTransferId)).toHaveLength(0);
    });
});
