import { describe, expect, it } from "vitest";
import { validateCurrency } from "../../src/domain/currency.validator.js";

describe("validateCurrency", () => {
    it.each(["USD", "EUR", "COP"])("accepts %s", (currency) => {
        expect(validateCurrency(currency)).toBe(currency);
    });

    it.each(["usd", "US$", "", "USDT", "USD ", null, 123])(
        "rejects unsupported value %s",
        (currency) => {
            expect(() => validateCurrency(currency)).toThrowError(
                expect.objectContaining({ code: "UNSUPPORTED_CURRENCY" }),
            );
        },
    );
});
