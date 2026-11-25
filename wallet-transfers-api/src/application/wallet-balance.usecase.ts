import { DomainError } from "../domain/errors.js";
import type { Currency } from "../domain/money.js";
import type { WalletStore } from "../infra/wallet-store.js";

export interface WalletBalanceResult {
    walletId: string;
    currency: Currency;
    balanceMinor: number;
    availableMinor: number;
}

export class WalletBalanceUseCase {
    constructor(private readonly store: WalletStore) {}

    async execute(walletId: string): Promise<WalletBalanceResult> {
        const wallet = await this.store.getWallet(walletId);
        if (!wallet?.active) {
            throw new DomainError("WALLET_NOT_FOUND", "La billetera no existe o no está activa.");
        }
        return {
            walletId: wallet.id,
            currency: wallet.currency,
            balanceMinor: wallet.balanceMinor,
            availableMinor: wallet.availableMinor,
        };
    }
}
