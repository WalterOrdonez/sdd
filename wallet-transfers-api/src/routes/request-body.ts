import { DomainError } from "../domain/errors.js";

export function bodyRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new DomainError("INVALID_REQUEST", "El cuerpo debe ser un objeto JSON.");
    }
    return value as Record<string, unknown>;
}

export function requiredString(
    body: Record<string, unknown>,
    field: string,
): string {
    const value = body[field];
    if (typeof value !== "string" || value.length === 0) {
        throw new DomainError("INVALID_REQUEST", `El campo ${field} es obligatorio.`);
    }
    return value;
}

export function requiredInteger(
    body: Record<string, unknown>,
    field: string,
): number {
    const value = body[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new DomainError("INVALID_AMOUNT", "El monto debe ser un entero seguro.");
    }
    return value;
}
