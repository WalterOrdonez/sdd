type Currency = "USD" | "EUR" | "COP";

export interface WalletBalance {
    walletId: string;
    currency: Currency;
    balanceMinor: number;
    availableMinor: number;
}

export interface FxQuoteEstimate {
    quoteId: string;
    from: Currency;
    to: Currency;
    rate: number;
    issuedAt: number;
    expiresAt: number;
    amountMinor: number;
    estimatedAmountMinor: number;
}

export interface TransferResult {
    transferId: string;
    status: string;
    fromBalanceMinor: number;
    toBalanceMinor: number;
}

export interface FxTransferResult {
    transferId: string;
    status: string;
    debitedMinor: number;
    creditedMinor: number;
    rate: number;
}

const apiBaseUrl =
    process.env.WALLET_TRANSFERS_API_URL ?? "http://localhost:3000";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string") {
        throw new Error(`Wallet Transfers API returned an invalid ${key}.`);
    }
    return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Wallet Transfers API returned an invalid ${key}.`);
    }
    return value;
}

function requiredInteger(record: Record<string, unknown>, key: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new Error(`Wallet Transfers API returned an invalid ${key}.`);
    }
    return value;
}

function requiredCurrency(
    record: Record<string, unknown>,
    key: string,
): Currency {
    const value = record[key];
    if (value !== "USD" && value !== "EUR" && value !== "COP") {
        throw new Error(`Wallet Transfers API returned an invalid ${key}.`);
    }
    return value;
}

async function requestApi(
    path: string,
    init?: RequestInit,
): Promise<unknown> {
    const base = `${apiBaseUrl.replace(/\/+$/, "")}/`;
    const response = await fetch(new URL(path, base), init);
    const payload: unknown = await response.json();
    if (!response.ok) {
        const message =
            isRecord(payload) && typeof payload.message === "string"
                ? payload.message
                : response.statusText;
        throw new Error(`Wallet Transfers API (${response.status}): ${message}`);
    }
    return payload;
}

export async function getWalletBalance(walletId: string): Promise<WalletBalance> {
    const payload = await requestApi(`wallets/${encodeURIComponent(walletId)}`);
    if (!isRecord(payload)) {
        throw new Error("Wallet Transfers API returned an invalid wallet response.");
    }
    return {
        walletId: requiredString(payload, "walletId"),
        currency: requiredCurrency(payload, "currency"),
        balanceMinor: requiredInteger(payload, "balanceMinor"),
        availableMinor: requiredInteger(payload, "availableMinor"),
    };
}

export async function createFxQuote(input: {
    from: Currency;
    to: Currency;
    amountMinor: number;
}): Promise<FxQuoteEstimate> {
    const payload = await requestApi("fx-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!isRecord(payload)) {
        throw new Error("Wallet Transfers API returned an invalid quote response.");
    }
    return {
        quoteId: requiredString(payload, "quoteId"),
        from: requiredCurrency(payload, "from"),
        to: requiredCurrency(payload, "to"),
        rate: requiredNumber(payload, "rate"),
        issuedAt: requiredInteger(payload, "issuedAt"),
        expiresAt: requiredInteger(payload, "expiresAt"),
        amountMinor: requiredInteger(payload, "amountMinor"),
        estimatedAmountMinor: requiredInteger(payload, "estimatedAmountMinor"),
    };
}

function postTransfer(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
): Promise<unknown> {
    return requestApi(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
    });
}

export async function createTransfer(
    input: {
        fromWalletId: string;
        toWalletId: string;
        amountMinor: number;
        currency: Currency;
    },
    idempotencyKey: string,
): Promise<TransferResult> {
    const payload = await postTransfer("transfers", input, idempotencyKey);
    if (!isRecord(payload)) {
        throw new Error("Wallet Transfers API returned an invalid transfer response.");
    }
    return {
        transferId: requiredString(payload, "transferId"),
        status: requiredString(payload, "status"),
        fromBalanceMinor: requiredInteger(payload, "fromBalanceMinor"),
        toBalanceMinor: requiredInteger(payload, "toBalanceMinor"),
    };
}

export async function createFxTransfer(
    input: {
        fromWalletId: string;
        toWalletId: string;
        amountMinor: number;
        quoteId: string;
    },
    idempotencyKey: string,
): Promise<FxTransferResult> {
    const payload = await postTransfer("fx-transfers", input, idempotencyKey);
    if (!isRecord(payload)) {
        throw new Error("Wallet Transfers API returned an invalid transfer response.");
    }
    return {
        transferId: requiredString(payload, "transferId"),
        status: requiredString(payload, "status"),
        debitedMinor: requiredInteger(payload, "debitedMinor"),
        creditedMinor: requiredInteger(payload, "creditedMinor"),
        rate: requiredNumber(payload, "rate"),
    };
}

