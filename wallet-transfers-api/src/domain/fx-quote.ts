import { randomUUID } from "node:crypto";
import { DomainError } from "./errors.js";
import type { Currency } from "./money.js";

export interface FxQuote {
    readonly quoteId: string;
    readonly from: Currency;
    readonly to: Currency;
    readonly rate: number;
    readonly issuedAt: number;
    readonly expiresAt: number;
}

export const MAX_QUOTE_TTL_MS = 60_000;

export function createFxQuote(
    from: Currency,
    to: Currency,
    rate: number,
    now = Date.now(),
    ttlMs = MAX_QUOTE_TTL_MS,
): FxQuote {
    if (from === to) {
        throw new DomainError("CURRENCY_MISMATCH", "La cotización requiere monedas distintas.");
    }
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new DomainError("INTERNAL", "La tasa configurada no es válida.");
    }
    if (
        !Number.isSafeInteger(now) ||
        !Number.isSafeInteger(ttlMs) ||
        ttlMs <= 0 ||
        ttlMs > MAX_QUOTE_TTL_MS ||
        !Number.isSafeInteger(now + ttlMs)
    ) {
        throw new DomainError("INTERNAL", "La vigencia de la cotización no es válida.");
    }
    return Object.freeze({
        quoteId: randomUUID(),
        from,
        to,
        rate,
        issuedAt: now,
        expiresAt: now + ttlMs,
    });
}

export function assertQuoteValid(quote: FxQuote, now = Date.now()): void {
    if (
        quote.expiresAt - quote.issuedAt > MAX_QUOTE_TTL_MS ||
        quote.expiresAt < quote.issuedAt ||
        now < quote.issuedAt ||
        now > quote.expiresAt
    ) {
        throw new DomainError("QUOTE_EXPIRED", "La cotización expiró.");
    }
}
