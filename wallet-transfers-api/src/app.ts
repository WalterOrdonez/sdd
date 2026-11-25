import express, { type Express } from "express";
import {
    ConfiguredFxRateProvider,
    FxQuoteUseCase,
    type FxRateProvider,
} from "./application/fx-quote.usecase.js";
import { FxTransferUseCase } from "./application/fx-transfer.usecase.js";
import { TransferUseCase } from "./application/transfer.usecase.js";
import { WalletBalanceUseCase } from "./application/wallet-balance.usecase.js";
import { errorMiddleware } from "./http/error-middleware.js";
import { MemoryWalletStore } from "./infra/memory-wallet-store.js";
import type { WalletStore } from "./infra/wallet-store.js";
import { createFxQuoteRouter } from "./routes/fx-quote.route.js";
import { createFxTransferRouter } from "./routes/fx-transfer.route.js";
import { createTransferRouter } from "./routes/transfer.route.js";
import { createWalletBalanceRouter } from "./routes/wallet-balance.route.js";

export interface AppDependencies {
    store?: WalletStore;
    rateProvider?: FxRateProvider;
}

export function createApp(dependencies: AppDependencies = {}): Express {
    const store = dependencies.store ?? new MemoryWalletStore();
    const rateProvider = dependencies.rateProvider ?? new ConfiguredFxRateProvider();
    const app = express();
    app.use(express.json({ limit: "32kb" }));
    app.get("/health", (_request, response) => {
        response.status(200).json({ status: "ok" });
    });
    app.use("/wallets", createWalletBalanceRouter(new WalletBalanceUseCase(store)));
    app.use("/transfers", createTransferRouter(new TransferUseCase(store)));
    app.use("/fx-quotes", createFxQuoteRouter(new FxQuoteUseCase(store, rateProvider)));
    app.use("/fx-transfers", createFxTransferRouter(new FxTransferUseCase(store)));
    app.use(errorMiddleware);
    return app;
}

export const app = createApp();
