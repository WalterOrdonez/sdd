export type ErrorCode =
    | "INVALID_REQUEST"
    | "INVALID_AMOUNT"
    | "UNSUPPORTED_CURRENCY"
    | "WALLET_NOT_FOUND"
    | "SAME_WALLET"
    | "CURRENCY_MISMATCH"
    | "INSUFFICIENT_FUNDS"
    | "QUOTE_EXPIRED"
    | "IDEMPOTENCY_CONFLICT"
    | "INTERNAL";

const businessCodes = new Set<ErrorCode>([
    "INVALID_AMOUNT",
    "UNSUPPORTED_CURRENCY",
    "WALLET_NOT_FOUND",
    "SAME_WALLET",
    "CURRENCY_MISMATCH",
    "INSUFFICIENT_FUNDS",
    "QUOTE_EXPIRED",
]);

export class DomainError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "DomainError";
    }

    get statusCode(): number {
        if (this.code === "IDEMPOTENCY_CONFLICT") return 409;
        if (this.code === "INVALID_REQUEST") return 400;
        if (businessCodes.has(this.code)) return 422;
        return 500;
    }
}

export function toErrorResult(error: unknown): {
    statusCode: number;
    body: { code: ErrorCode; message: string };
} {
    if (error instanceof DomainError) {
        return {
            statusCode: error.statusCode,
            body: {
                code: error.code,
                message:
                    error.code === "INTERNAL"
                        ? "Ocurrió un error interno."
                        : error.message,
            },
        };
    }
    return {
        statusCode: 500,
        body: { code: "INTERNAL", message: "Ocurrió un error interno." },
    };
}
