import { describe, expect, it } from "vitest";
import {
    calculateConversion,
    convertMinor,
    createFxLedgerEntries,
} from "../../src/domain/fx-conversion.js";
import { assertBalanced } from "../../src/domain/ledger.js";
import { createFxQuote } from "../../src/domain/fx-quote.js";

describe("FX conversion", () => {
    it("rounds positive values half-up without floating point money arithmetic", () => {
        expect(convertMinor(1, 0.5)).toBe(1);
        expect(convertMinor(1, 2.5)).toBe(3);
        expect(convertMinor(3_000, 4_000)).toBe(12_000_000);
    });

    it("creates balanced integer postings including FX counterpart accounts", () => {
        const quote = createFxQuote("USD", "COP", 4000, 100);
        const entries = createFxLedgerEntries(
            "T-1",
            "W-USD",
            "W-COP",
            3000,
            12_000_000,
            quote,
        );
        expect(entries.map((entry) => entry.amountMinor)).toEqual([
            -3000,
            3000,
            12_000_000,
            -12_000_000,
        ]);
        assertBalanced(
            entries.map(({ account, amountMinor, currency }) => ({
                account,
                amountMinor,
                currency,
            })),
        );
    });

    it("records the sub-minor rounding remainder on the FX account", () => {
        const conversion = calculateConversion(3, 0.3333);
        expect(conversion).toEqual({
            creditedMinor: 1,
            roundingResidual: { numerator: "-1", denominator: "10000" },
        });
        const entries = createFxLedgerEntries(
            "T-2",
            "W-USD",
            "W-COP",
            3,
            1,
            createFxQuote("USD", "COP", 0.3333, 100),
        );
        expect(entries.find((entry) => entry.account === "fx:COP")?.roundingResidual).toEqual(
            conversion.roundingResidual,
        );
    });
});
