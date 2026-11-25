import type { ErrorRequestHandler } from "express";
import { DomainError, toErrorResult } from "../domain/errors.js";

export const errorMiddleware: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
) => {
    if (response.headersSent) {
        next(error);
        return;
    }
    if (
        error instanceof SyntaxError &&
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 400
    ) {
        response.status(400).json({
            code: "INVALID_REQUEST",
            message: "El cuerpo JSON no es válido.",
        });
        return;
    }
    if (!(error instanceof DomainError)) {
        console.error("Unhandled wallet-transfers API error", error);
    }
    const result = toErrorResult(error);
    response.status(result.statusCode).json(result.body);
};
