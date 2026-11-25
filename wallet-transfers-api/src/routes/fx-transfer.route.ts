import { Router } from "express";
import type { FxTransferUseCase } from "../application/fx-transfer.usecase.js";
import {
    bodyRecord,
    requiredInteger,
    requiredString,
} from "./request-body.js";

export function createFxTransferRouter(useCase: FxTransferUseCase): Router {
    const router = Router();
    router.post("/", async (request, response) => {
        const body = bodyRecord(request.body);
        const result = await useCase.execute(
            {
                fromWalletId: requiredString(body, "fromWalletId"),
                toWalletId: requiredString(body, "toWalletId"),
                amountMinor: requiredInteger(body, "amountMinor"),
                quoteId: requiredString(body, "quoteId"),
            },
            request.get("Idempotency-Key") ?? "",
        );
        response.status(201).json(result);
    });
    return router;
}
