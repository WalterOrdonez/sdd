import { DomainError } from "./errors.js";
import type { FxQuote } from "./fx-quote.js";
import { assertBalanced, createLedgerEntries } from "./ledger.js";
import type { LedgerEntry } from "./ledger-entry.entity.js";

function rateRatio(rate: number): { numerator: bigint; denominator: bigint } {
    const text = rate.toString().toLowerCase();
    const [coefficient = "", exponentText = "0"] = text.split("e");
    const exponent = Number(exponentText);
    const [whole = "0", fraction = ""] = coefficient.split(".");
    const digits = `${whole}${fraction}`;
    const scale = fraction.length - exponent;
    if (!/^\d+$/.test(digits) || !Number.isSafeInteger(scale)) {
        throw new DomainError("INTERNAL", "La tasa configurada no es válida.");
    }
    if (scale <= 0) {
        return {
            numerator: BigInt(digits) * 10n ** BigInt(-scale),
            denominator: 1n,
        };
    }
    return {
        numerator: BigInt(digits),
        denominator: 10n ** BigInt(scale),
    };
}

export function convertMinor(amountMinor: number, rate: number): number {
    return calculateConversion(amountMinor, rate).creditedMinor;
}

export interface FxConversion {
    creditedMinor: number;
    roundingResidual?: {
        numerator: string;
        denominator: string;
    };
}

export function calculateConversion(amountMinor: number, rate: number): FxConversion {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new DomainError("INVALID_AMOUNT", "El monto debe ser mayor que cero.");
    }
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new DomainError("INTERNAL", "La tasa debe ser positiva.");
    }
    const { numerator, denominator } = rateRatio(rate);
    const product = BigInt(amountMinor) * numerator;
    const rounded = (product * 2n + denominator) / (2n * denominator);
    const result = Number(rounded);
    if (!Number.isSafeInteger(result) || result <= 0) {
        throw new DomainError("INVALID_AMOUNT", "El monto convertido excede el rango permitido.");
    }
    const residual = product - rounded * denominator;
    return {
        creditedMinor: result,
        ...(residual === 0n
            ? {}
            : {
                  roundingResidual: {
                      numerator: residual.toString(),
                      denominator: denominator.toString(),
                  },
              }),
    };
}

export function createFxLedgerEntries(
    transferId: string,
    fromWalletId: string,
    toWalletId: string,
    amountMinor: number,
    creditedMinor: number,
    quote: FxQuote,
    now = Date.now(),
): readonly LedgerEntry[] {
    const conversion = calculateConversion(amountMinor, quote.rate);
    if (conversion.creditedMinor !== creditedMinor) {
        throw new DomainError("INTERNAL", "El monto convertido no coincide con la tasa.");
    }
    const lines = [
        { account: `wallet:${fromWalletId}`, amountMinor: -amountMinor, currency: quote.from },
        { account: `fx:${quote.from}`, amountMinor, currency: quote.from },
        { account: `wallet:${toWalletId}`, amountMinor: creditedMinor, currency: quote.to },
        {
            account: `fx:${quote.to}`,
            amountMinor: -creditedMinor,
            currency: quote.to,
            ...(conversion.roundingResidual
                ? { roundingResidual: conversion.roundingResidual }
                : {}),
        },
    ] as const;
    assertBalanced(lines);
    return createLedgerEntries(transferId, lines, now);
}
