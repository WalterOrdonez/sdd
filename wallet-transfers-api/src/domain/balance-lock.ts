import { DomainError } from "./errors.js";
import type { Wallet } from "./wallet.entity.js";

export function holdBalance(wallet: Wallet, amountMinor: number): void {
    if (!wallet.active) {
        throw new DomainError("WALLET_NOT_FOUND", "La billetera no existe o no está activa.");
    }
    wallet.hold(amountMinor);
}

export function releaseBalance(wallet: Wallet, amountMinor: number): void {
    wallet.release(amountMinor);
}

export function unlockBalance(wallet: Wallet, amountMinor: number): void {
    wallet.release(amountMinor);
}
