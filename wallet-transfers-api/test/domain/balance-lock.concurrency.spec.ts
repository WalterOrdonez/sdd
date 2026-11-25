import { describe, expect, it } from "vitest";
import { holdBalance } from "../../src/domain/balance-lock.js";
import { Wallet } from "../../src/domain/wallet.entity.js";
import { MemoryWalletStore } from "../../src/infra/memory-wallet-store.js";

describe("balance holds under concurrency", () => {
    it("serializes competing holds so they cannot exceed available funds", async () => {
        const store = new MemoryWalletStore();
        await store.seedWallet(
            new Wallet({
                id: "W-1",
                currency: "USD",
                balanceMinor: 10_000,
                lockedMinor: 0,
                active: true,
            }),
        );
        const reserve = (): Promise<void> =>
            store.transaction(async (tx) => {
                const wallet = await tx.getWallet("W-1", true);
                if (!wallet) throw new Error("Missing wallet");
                holdBalance(wallet, 6_000);
                expect(wallet.availableMinor).toBe(4_000);
                wallet.debitHeld(6_000);
                expect(wallet.availableMinor).toBe(4_000);
                wallet.restoreHeldDebit(6_000);
                await tx.saveWallet(wallet);
            });
        const results = await Promise.allSettled([reserve(), reserve()]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        const wallet = await store.getWallet("W-1");
        expect(wallet?.lockedMinor).toBe(6_000);
        expect(wallet?.availableMinor).toBe(4_000);
    });
});
