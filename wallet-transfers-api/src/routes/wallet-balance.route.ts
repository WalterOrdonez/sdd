import { Router } from "express";
import type { WalletBalanceUseCase } from "../application/wallet-balance.usecase.js";

export function createWalletBalanceRouter(useCase: WalletBalanceUseCase): Router {
    const router = Router();
    router.get("/:walletId", async (request, response) => {
        const result = await useCase.execute(request.params.walletId);
        response.status(200).json(result);
    });
    return router;
}
