import { randomUUID } from "node:crypto";
import { DomainError } from "./errors.js";
import type { Currency } from "./money.js";
import type { LedgerEntry } from "./ledger-entry.entity.js";

export type LedgerLine = {
    account: string;
    amountMinor: number;
    currency: Currency;
    roundingResidual?: {
        numerator: string;
        denominator: string;
    };
};

export function assertBalanced(lines: readonly LedgerLine[]): void {
    const netByCurrency = new Map<Currency, number>();
    for (const line of lines) {
        if (!Number.isSafeInteger(line.amountMinor)) {
            throw new DomainError("INTERNAL", "Un asiento contable no es entero.");
        }
        const net = (netByCurrency.get(line.currency) ?? 0) + line.amountMinor;
        if (!Number.isSafeInteger(net)) {
            throw new DomainError("INTERNAL", "El total contable excede el rango seguro.");
        }
        netByCurrency.set(line.currency, net);
    }
    if ([...netByCurrency.values()].some((net) => net !== 0)) {
        throw new DomainError("INTERNAL", "Los asientos contables no cuadran.");
    }
}

export function createLedgerEntries(
    transferId: string,
    lines: readonly LedgerLine[],
    now = Date.now(),
): readonly LedgerEntry[] {
    assertBalanced(lines);
    return Object.freeze(
        lines.map((line) =>
            Object.freeze({
                id: randomUUID(),
                transferId,
                ...line,
                ...(line.roundingResidual
                    ? { roundingResidual: Object.freeze({ ...line.roundingResidual }) }
                    : {}),
                createdAt: now,
            }),
        ),
    );
}

export function createReversalEntries(
    entries: readonly LedgerEntry[],
    now = Date.now(),
): readonly LedgerEntry[] {
    const reversalLines = entries.map((entry) => ({
        account: entry.account,
        amountMinor: -entry.amountMinor,
        currency: entry.currency,
        ...(entry.roundingResidual
            ? {
                  roundingResidual: {
                      numerator: (-BigInt(entry.roundingResidual.numerator)).toString(),
                      denominator: entry.roundingResidual.denominator,
                  },
              }
            : {}),
    }));
    assertBalanced(reversalLines);
    return Object.freeze(
        entries.map((entry) =>
            Object.freeze({
                id: randomUUID(),
                transferId: entry.transferId,
                account: entry.account,
                amountMinor: -entry.amountMinor,
                currency: entry.currency,
                reversesEntryId: entry.id,
                createdAt: now,
            }),
        ),
    );
}
