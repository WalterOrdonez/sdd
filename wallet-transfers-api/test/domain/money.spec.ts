import { describe, expect, it } from "vitest";
import { createMoney, createPositiveMoney } from "../../src/domain/money.js";
import { DomainError } from "../../src/domain/errors.js";

describe("Money", () => {
    it("stores integer minor units with currency", () => {
        expect(createMoney(1234, "USD")).toEqual({
            amountMinor: 1234,
            currency: "USD",
        });
    });

    it("rejects fractional and unsafe amounts", () => {
        expect(() => createMoney(1.5, "USD")).toThrow(DomainError);
        expect(() => createMoney(Number.MAX_SAFE_INTEGER + 1, "USD")).toThrow(
            DomainError,
        );
    });

    it("requires a strictly positive amount for transfer requests", () => {
        expect(() => createPositiveMoney(0, "USD")).toThrowError(
            expect.objectContaining({ code: "INVALID_AMOUNT" }),
        );
        expect(() => createPositiveMoney(-1, "USD")).toThrowError(
            expect.objectContaining({ code: "INVALID_AMOUNT" }),
        );
    });
});
