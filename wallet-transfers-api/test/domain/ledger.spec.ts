import { describe, expect, it } from "vitest";
import {
    assertBalanced,
    createLedgerEntries,
    createReversalEntries,
} from "../../src/domain/ledger.js";

describe("ledger", () => {
    it("accepts zero-net entries per currency and returns immutable records", () => {
        const entries = createLedgerEntries("T-1", [
            { account: "wallet:a", amountMinor: -100, currency: "USD" },
            { account: "wallet:b", amountMinor: 100, currency: "USD" },
        ]);
        expect(Object.isFrozen(entries)).toBe(true);
        expect(Object.isFrozen(entries[0])).toBe(true);
        expect(() =>
            assertBalanced([
                { account: "wallet:a", amountMinor: -100, currency: "USD" },
                { account: "wallet:b", amountMinor: 100, currency: "EUR" },
            ]),
        ).toThrow("no cuadran");
    });

    it("reverses with new append-only entries linked to their originals", () => {
        const original = createLedgerEntries("T-1", [
            { account: "wallet:a", amountMinor: -100, currency: "USD" },
            { account: "wallet:b", amountMinor: 100, currency: "USD" },
        ]);
        const reversal = createReversalEntries(original);
        expect(reversal.map((entry) => entry.amountMinor)).toEqual([100, -100]);
        expect(reversal.map((entry) => entry.reversesEntryId)).toEqual(
            original.map((entry) => entry.id),
        );
        expect(original.map((entry) => entry.amountMinor)).toEqual([-100, 100]);
    });
});
