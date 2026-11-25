import { describe, expect, it } from "vitest";
import {
    assertQuoteValid,
    createFxQuote,
    MAX_QUOTE_TTL_MS,
} from "../../src/domain/fx-quote.js";

describe("FxQuote", () => {
    it("uses the server clock and caps quote lifetime at 60 seconds", () => {
        const quote = createFxQuote("USD", "COP", 4000, 1_000);
        expect(quote.issuedAt).toBe(1_000);
        expect(quote.expiresAt - quote.issuedAt).toBeLessThanOrEqual(
            MAX_QUOTE_TTL_MS,
        );
        expect(() => createFxQuote("USD", "COP", 1, 0, 60_001)).toThrow();
    });

    it("accepts a quote at 59 seconds and at the expiry instant, rejects it after 61 seconds", () => {
        const quote = createFxQuote("USD", "COP", 4000, 10_000);
        expect(() => assertQuoteValid(quote, 69_000)).not.toThrow();
        expect(() => assertQuoteValid(quote, quote.expiresAt)).not.toThrow();
        expect(() => assertQuoteValid(quote, 71_000)).toThrowError(
            expect.objectContaining({ code: "QUOTE_EXPIRED" }),
        );
    });

    it("requires a positive rate and different currencies", () => {
        expect(() => createFxQuote("USD", "COP", 0)).toThrow();
        expect(() => createFxQuote("USD", "USD", 1)).toThrowError(
            expect.objectContaining({ code: "CURRENCY_MISMATCH" }),
        );
    });
});
