import { Wallet } from "../src/domain/wallet.entity.js";
import { MemoryWalletStore } from "../src/infra/memory-wallet-store.js";

export async function makeSameCurrencyStore(): Promise<MemoryWalletStore> {
    const store = new MemoryWalletStore();
    await store.seedWallet(
        new Wallet({
            id: "W-ORIGEN",
            currency: "USD",
            balanceMinor: 10_000,
            lockedMinor: 0,
            active: true,
        }),
    );
    await store.seedWallet(
        new Wallet({
            id: "W-DESTINO",
            currency: "USD",
            balanceMinor: 0,
            lockedMinor: 0,
            active: true,
        }),
    );
    return store;
}

export async function makeFxStore(): Promise<MemoryWalletStore> {
    const store = await makeSameCurrencyStore();
    await store.seedWallet(
        new Wallet({
            id: "W-COP",
            currency: "COP",
            balanceMinor: 0,
            lockedMinor: 0,
            active: true,
        }),
    );
    return store;
}
