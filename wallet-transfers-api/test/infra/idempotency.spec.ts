import { describe, expect, it } from "vitest";
import { TransferUseCase } from "../../src/application/transfer.usecase.js";
import { makeSameCurrencyStore } from "../helpers.js";

describe("idempotency", () => {
    it("returns one original transfer for concurrent identical requests", async () => {
        const store = await makeSameCurrencyStore();
        const useCase = new TransferUseCase(store);
        const input = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-DESTINO",
            amountMinor: 2500,
            currency: "USD",
        };
        const [first, second] = await Promise.all([
            useCase.execute(input, "SAME-KEY"),
            useCase.execute(input, "SAME-KEY"),
        ]);
        expect(first).toEqual(second);
        expect(await store.getLedgerEntries(first.transferId)).toHaveLength(2);
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(7500);
    });
});
