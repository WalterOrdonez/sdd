import type { Currency } from "./money.js";

export interface LedgerEntry {
    readonly id: string;
    readonly transferId: string;
    readonly account: string;
    readonly amountMinor: number;
    readonly currency: Currency;
    readonly roundingResidual?: {
        readonly numerator: string;
        readonly denominator: string;
    };
    readonly reversesEntryId?: string;
    readonly createdAt: number;
}
