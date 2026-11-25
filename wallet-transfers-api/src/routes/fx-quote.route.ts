import { Router } from "express";
import type { FxQuoteUseCase } from "../application/fx-quote.usecase.js";
import { bodyRecord, requiredInteger } from "./request-body.js";

export function createFxQuoteRouter(useCase: FxQuoteUseCase): Router {
    const router = Router();
    router.post("/", async (request, response) => {
        const body = bodyRecord(request.body);
        const quote = await useCase.execute({
            from: body.from,
            to: body.to,
            amountMinor: requiredInteger(body, "amountMinor"),
        });
        response.status(201).json(quote);
    });
    return router;
}
