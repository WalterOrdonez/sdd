import { describe, expect, it } from "vitest";
import { FxTransferUseCase } from "../../src/application/fx-transfer.usecase.js";
import { createFxQuote } from "../../src/domain/fx-quote.js";
import { assertBalanced } from "../../src/domain/ledger.js";
import { makeFxStore } from "../helpers.js";
import { MemoryWalletStore } from "../../src/infra/memory-wallet-store.js";
import type { TransactionContext } from "../../src/infra/wallet-store.js";

class FailFirstDestinationSaveStore extends MemoryWalletStore {
    private shouldFail = false;
    private shouldFailCompensation = false;

    arm(failCompensation = false): void {
        this.shouldFail = true;
        this.shouldFailCompensation = failCompensation;
    }

    override transaction<T>(
        work: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> {
        return super.transaction((tx) =>
            work({
                getWallet: (id, forUpdate) => tx.getWallet(id, forUpdate),
                saveWallet: async (wallet) => {
                    if (wallet.id === "W-COP" && this.shouldFail) {
                        this.shouldFail = false;
                        if (this.shouldFailCompensation) {
                            this.shouldFailSource = true;
                        }
                        throw new Error("injected destination failure");
                    }
                    if (wallet.id === "W-ORIGEN" && this.shouldFailSource) {
                        throw new Error("injected compensation failure");
                    }
                    await tx.saveWallet(wallet);
                },
                getQuote: (id) => tx.getQuote(id),
                saveQuote: (quote) => tx.saveQuote(quote),
                getIdempotency: (key) => tx.getIdempotency(key),
                saveIdempotency: (record) => tx.saveIdempotency(record),
                saveTransfer: (transfer) => tx.saveTransfer(transfer),
                appendLedger: (entries) => tx.appendLedger(entries),
            }),
        );
    }

    private shouldFailSource = false;
}

describe("FxTransferUseCase", () => {
    it("uses the frozen quote and produces balanced FX postings", async () => {
        const store = await makeFxStore();
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        const useCase = new FxTransferUseCase(store, undefined, () => 2000);
        const request = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-COP",
            amountMinor: 3000,
            quoteId: quote.quoteId,
        };

        const result = await useCase.execute(request, "FX-KEY");
        expect(result).toMatchObject({
            status: "COMPLETADA",
            debitedMinor: 3000,
            creditedMinor: 12_000_000,
            rate: 4000,
        });
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(7000);
        expect((await store.getWallet("W-COP"))?.balanceMinor).toBe(12_000_000);
        expect(await store.getLedgerEntries(result.transferId)).toHaveLength(4);
        expect(await useCase.execute(request, "FX-KEY")).toEqual(result);
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(7000);
        expect(await store.getLedgerEntries(result.transferId)).toHaveLength(4);
    });

    it("rejects an expired quote without changing either balance", async () => {
        const store = await makeFxStore();
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        const useCase = new FxTransferUseCase(store, undefined, () => 61_001);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-COP",
                    amountMinor: 3000,
                    quoteId: quote.quoteId,
                },
                "EXPIRED",
            ),
        ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(10_000);
        expect((await store.getWallet("W-COP"))?.balanceMinor).toBe(0);
    });

    it("rejects insufficient available funds without applying the quote", async () => {
        const store = await makeFxStore();
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        const useCase = new FxTransferUseCase(store, undefined, () => 2000);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-COP",
                    amountMinor: 15_000,
                    quoteId: quote.quoteId,
                },
                "NO-FUNDS",
            ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(10_000);
        expect((await store.getWallet("W-COP"))?.balanceMinor).toBe(0);
    });

    it("rejects same-currency FX", async () => {
        const store = await makeFxStore();
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        await expect(
            new FxTransferUseCase(store).execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-DESTINO",
                    amountMinor: 100,
                    quoteId: quote.quoteId,
                },
                "SAME",
            ),
        ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    });

    it("compensates a failed destination credit after debit and records COMPENSADA", async () => {
        const base = await makeFxStore();
        const store = new FailFirstDestinationSaveStore();
        for (const id of ["W-ORIGEN", "W-DESTINO", "W-COP"]) {
            const wallet = await base.getWallet(id);
            if (wallet) await store.seedWallet(wallet);
        }
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        store.arm();
        const useCase = new FxTransferUseCase(store, undefined, () => 2000);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-COP",
                    amountMinor: 3000,
                    quoteId: quote.quoteId,
                },
                "COMPENSATE",
            ),
        ).rejects.toMatchObject({ code: "INTERNAL" });
        expect((await store.getWallet("W-ORIGEN"))?.snapshot()).toMatchObject({
            balanceMinor: 10_000,
            lockedMinor: 0,
        });
        expect((await store.getWallet("W-COP"))?.balanceMinor).toBe(0);
        const transfers = await store.transaction(async (tx) => {
            const record = await tx.getIdempotency("COMPENSATE");
            return record?.result as { transferId: string };
        });
        const transfer = await store.getTransfer(transfers.transferId);
        expect(transfer?.status).toBe("COMPENSADA");
        const entries = await store.getLedgerEntries(transfers.transferId);
        expect(entries).toHaveLength(8);
        assertBalanced(
            entries.map(({ account, amountMinor, currency }) => ({
                account,
                amountMinor,
                currency,
            })),
        );
    });

    it("records FALLIDA and an intervention reason when a compensation fails", async () => {
        const base = await makeFxStore();
        const store = new FailFirstDestinationSaveStore();
        for (const id of ["W-ORIGEN", "W-DESTINO", "W-COP"]) {
            const wallet = await base.getWallet(id);
            if (wallet) await store.seedWallet(wallet);
        }
        const quote = createFxQuote("USD", "COP", 4000, 1000);
        await store.seedQuote(quote);
        store.arm(true);
        const useCase = new FxTransferUseCase(store, undefined, () => 2000);
        await expect(
            useCase.execute(
                {
                    fromWalletId: "W-ORIGEN",
                    toWalletId: "W-COP",
                    amountMinor: 3000,
                    quoteId: quote.quoteId,
                },
                "UNRECOVERABLE",
            ),
        ).rejects.toMatchObject({ code: "INTERNAL" });
        const transferId = await store.transaction(async (tx) => {
            const record = await tx.getIdempotency("UNRECOVERABLE");
            if (
                typeof record?.result !== "object" ||
                record.result === null ||
                !("transferId" in record.result) ||
                typeof record.result.transferId !== "string"
            ) {
                throw new Error("Failure record was not persisted.");
            }
            return record.result.transferId;
        });
        expect(await store.getTransfer(transferId)).toMatchObject({
            status: "FALLIDA",
            failureReason: "Compensación incompleta; requiere intervención manual.",
        });
    });
});
