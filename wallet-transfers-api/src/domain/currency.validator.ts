import { DomainError } from "./errors.js";
import { currencies, type Currency } from "./money.js";

export function validateCurrency(value: unknown): Currency {
    if (
        typeof value !== "string" ||
        !currencies.includes(value as Currency)
    ) {
        throw new DomainError(
            "UNSUPPORTED_CURRENCY",
            "La moneda no está soportada.",
        );
    }
    return value as Currency;
}
