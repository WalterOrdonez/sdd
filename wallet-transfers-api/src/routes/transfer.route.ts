import { Router } from "express";
import type { TransferUseCase } from "../application/transfer.usecase.js";
import {
    bodyRecord,
    requiredInteger,
    requiredString,
} from "./request-body.js";

export function createTransferRouter(useCase: TransferUseCase): Router {
    const router = Router();
    router.post("/", async (request, response) => {
        const body = bodyRecord(request.body);
        const result = await useCase.execute(
            {
                fromWalletId: requiredString(body, "fromWalletId"),
                toWalletId: requiredString(body, "toWalletId"),
                amountMinor: requiredInteger(body, "amountMinor"),
                currency: body.currency,
            },
            request.get("Idempotency-Key") ?? "",
        );
        response.status(201).json(result);
    });
    return router;
}
