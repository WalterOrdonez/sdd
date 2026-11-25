import { DomainError } from "./errors.js";

export const currencies = ["USD", "EUR", "COP"] as const;
export type Currency = (typeof currencies)[number];

export interface Money {
    readonly amountMinor: number;
    readonly currency: Currency;
}

export function assertPositiveAmountMinor(amountMinor: number): number {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new DomainError("INVALID_AMOUNT", "El monto debe ser mayor que cero.");
    }
    return amountMinor;
}

export function createMoney(amountMinor: number, currency: Currency): Money {
    if (!Number.isSafeInteger(amountMinor)) {
        throw new DomainError(
            "INVALID_AMOUNT",
            "El monto debe ser un entero seguro en unidades menores.",
        );
    }
    return Object.freeze({ amountMinor, currency });
}

export function createPositiveMoney(
    amountMinor: number,
    currency: Currency,
): Money {
    return createMoney(assertPositiveAmountMinor(amountMinor), currency);
}
