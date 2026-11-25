import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";
import { executeInQueryRunner } from "../../src/infra/unit-of-work.js";
import type { TransactionContext } from "../../src/infra/wallet-store.js";
import { makeSameCurrencyStore } from "../helpers.js";

describe("unit of work", () => {
    it("commits only after the operation succeeds and rolls back on failure", async () => {
        const runner = {
            isTransactionActive: true,
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
        };
        const context: TransactionContext = {
            getWallet: async () => undefined,
            saveWallet: async () => undefined,
            getQuote: async () => undefined,
            saveQuote: async () => undefined,
            getIdempotency: async () => undefined,
            saveIdempotency: async () => undefined,
            saveTransfer: async () => undefined,
            appendLedger: async () => undefined,
        };
        await expect(
            executeInQueryRunner(
                runner as unknown as QueryRunner,
                async () => {
                    throw new Error("simulated failure");
                },
                () => context,
            ),
        ).rejects.toThrow("simulated failure");
        expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
        expect(runner.commitTransaction).not.toHaveBeenCalled();
        expect(runner.release).toHaveBeenCalledOnce();
    });

    it("does not commit state mutated inside a failed in-memory transaction", async () => {
        const store = await makeSameCurrencyStore();
        const before = (await store.getWallet("W-ORIGEN"))?.snapshot();
        await expect(
            store.transaction(async (tx) => {
                const wallet = await tx.getWallet("W-ORIGEN", true);
                if (!wallet) throw new Error("Missing wallet");
                wallet.debit(1000);
                await tx.saveWallet(wallet);
                throw new Error("simulated failure");
            }),
        ).rejects.toThrow("simulated failure");
        expect((await store.getWallet("W-ORIGEN"))?.snapshot()).toEqual(before);
    });

    it("releases a connected runner when transaction startup fails", async () => {
        const runner = {
            isTransactionActive: false,
            connect: vi.fn(),
            startTransaction: vi.fn().mockRejectedValue(new Error("start failed")),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
        };
        const context: TransactionContext = {
            getWallet: async () => undefined,
            saveWallet: async () => undefined,
            getQuote: async () => undefined,
            saveQuote: async () => undefined,
            getIdempotency: async () => undefined,
            saveIdempotency: async () => undefined,
            saveTransfer: async () => undefined,
            appendLedger: async () => undefined,
        };
        await expect(
            executeInQueryRunner(
                runner as unknown as QueryRunner,
                async () => undefined,
                () => context,
            ),
        ).rejects.toThrow("start failed");
        expect(runner.rollbackTransaction).not.toHaveBeenCalled();
        expect(runner.release).toHaveBeenCalledOnce();
    });
});
