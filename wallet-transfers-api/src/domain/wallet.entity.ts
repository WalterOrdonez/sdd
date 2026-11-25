import { DomainError } from "./errors.js";
import { validateCurrency } from "./currency.validator.js";
import { createMoney, type Currency, type Money } from "./money.js";

export type WalletSnapshot = {
    id: string;
    currency: Currency;
    balanceMinor: number;
    lockedMinor: number;
    active: boolean;
};

export class Wallet {
    readonly id: string;
    readonly currency: Currency;
    private balance: number;
    private locked: number;
    readonly active: boolean;

    constructor(snapshot: WalletSnapshot) {
        const currency = validateCurrency(snapshot.currency);
        if (
            !snapshot.id ||
            !Number.isSafeInteger(snapshot.balanceMinor) ||
            !Number.isSafeInteger(snapshot.lockedMinor) ||
            snapshot.balanceMinor < 0 ||
            snapshot.lockedMinor < 0 ||
            snapshot.lockedMinor > snapshot.balanceMinor
        ) {
            throw new DomainError("INTERNAL", "Estado de billetera inválido.");
        }
        this.id = snapshot.id;
        this.currency = currency;
        this.balance = snapshot.balanceMinor;
        this.locked = snapshot.lockedMinor;
        this.active = snapshot.active;
    }

    get balanceMinor(): number {
        return this.balance;
    }

    get lockedMinor(): number {
        return this.locked;
    }

    get availableMinor(): number {
        return this.balance - this.locked;
    }

    hold(amountMinor: number): void {
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
            throw new DomainError("INVALID_AMOUNT", "El monto debe ser mayor que cero.");
        }
        if (this.availableMinor < amountMinor) {
            throw new DomainError(
                "INSUFFICIENT_FUNDS",
                "El saldo disponible es insuficiente.",
            );
        }
        this.locked += amountMinor;
    }

    release(amountMinor: number): void {
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > this.locked) {
            throw new DomainError("INTERNAL", "No se puede liberar el bloqueo.");
        }
        this.locked -= amountMinor;
    }

    debit(amountMinor: number): void {
        if (
            !Number.isSafeInteger(amountMinor) ||
            amountMinor <= 0 ||
            amountMinor > this.availableMinor
        ) {
            throw new DomainError("INSUFFICIENT_FUNDS", "El saldo es insuficiente.");
        }
        this.balance -= amountMinor;
    }

    debitHeld(amountMinor: number): void {
        if (
            !Number.isSafeInteger(amountMinor) ||
            amountMinor <= 0 ||
            amountMinor > this.locked ||
            amountMinor > this.balance
        ) {
            throw new DomainError("INSUFFICIENT_FUNDS", "El saldo bloqueado es insuficiente.");
        }
        this.balance -= amountMinor;
        this.locked -= amountMinor;
    }

    restoreHeldDebit(amountMinor: number): void {
        if (
            !Number.isSafeInteger(amountMinor) ||
            amountMinor <= 0 ||
            !Number.isSafeInteger(this.balance + amountMinor) ||
            !Number.isSafeInteger(this.locked + amountMinor)
        ) {
            throw new DomainError("INTERNAL", "No se puede compensar el débito.");
        }
        this.balance += amountMinor;
        this.locked += amountMinor;
    }

    credit(amountMinor: number): void {
        if (
            !Number.isSafeInteger(amountMinor) ||
            amountMinor <= 0 ||
            !Number.isSafeInteger(this.balance + amountMinor)
        ) {
            throw new DomainError("INVALID_AMOUNT", "El crédito excede el rango permitido.");
        }
        this.balance += amountMinor;
    }

    moneyAvailable(): Money {
        return createMoney(this.availableMinor, this.currency);
    }

    snapshot(): WalletSnapshot {
        return {
            id: this.id,
            currency: this.currency,
            balanceMinor: this.balance,
            lockedMinor: this.locked,
            active: this.active,
        };
    }
}
