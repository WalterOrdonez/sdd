import {
    createFxQuote,
    type FxQuote,
} from "../domain/fx-quote.js";
import { convertMinor } from "../domain/fx-conversion.js";
import { validateCurrency } from "../domain/currency.validator.js";
import { DomainError } from "../domain/errors.js";
import type { WalletStore } from "../infra/wallet-store.js";

export interface FxQuoteEstimate extends FxQuote {
    amountMinor: number;
    estimatedAmountMinor: number;
}

export interface FxRateProvider {
    getRate(from: string, to: string): number;
}

export class ConfiguredFxRateProvider implements FxRateProvider {
    private readonly rates: Record<string, number>;

    constructor(serializedRates = process.env.FX_RATES_JSON ?? "{}") {
        let parsed: unknown;
        try {
            parsed = JSON.parse(serializedRates) as unknown;
        } catch {
            throw new Error("FX_RATES_JSON must contain a valid JSON object.");
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("FX_RATES_JSON must contain a JSON object.");
        }
        this.rates = Object.create(null) as Record<string, number>;
        for (const [pair, rate] of Object.entries(parsed)) {
            if (typeof rate !== "number" && typeof rate !== "string") {
                throw new Error(`FX rate for ${pair} must be a positive number.`);
            }
            const numericRate = Number(rate);
            if (!Number.isFinite(numericRate) || numericRate <= 0) {
                throw new Error(`FX rate for ${pair} must be a positive number.`);
            }
            this.rates[pair] = numericRate;
        }
    }

    getRate(from: string, to: string): number {
        const rate = this.rates[`${from}_${to}`];
        if (rate === undefined) {
            throw new Error(`No configured FX rate for ${from}/${to}.`);
        }
        return rate;
    }
}

export class FxQuoteUseCase {
    constructor(
        private readonly store: WalletStore,
        private readonly rateProvider: FxRateProvider,
        private readonly now: () => number = Date.now,
    ) {}

    async execute(input: {
        from: unknown;
        to: unknown;
        amountMinor: number;
    }): Promise<FxQuoteEstimate> {
        const from = validateCurrency(input.from);
        const to = validateCurrency(input.to);
        if (from === to) {
            throw new DomainError(
                "CURRENCY_MISMATCH",
                "La cotización requiere monedas distintas.",
            );
        }
        if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
            throw new DomainError("INVALID_AMOUNT", "El monto debe ser mayor que cero.");
        }
        const quote = createFxQuote(from, to, this.rateProvider.getRate(from, to), this.now());
        const estimatedAmountMinor = convertMinor(input.amountMinor, quote.rate);
        await this.store.transaction((tx) => tx.saveQuote(quote));
        return {
            ...quote,
            amountMinor: input.amountMinor,
            estimatedAmountMinor,
        };
    }
}
