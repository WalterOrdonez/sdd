import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("Express app", () => {
    it("responds to health checks and emits contract-shaped errors", async () => {
        const app = createApp();
        await request(app).get("/health").expect(200, { status: "ok" });
        const response = await request(app)
            .post("/transfers")
            .send({
                fromWalletId: "A",
                toWalletId: "B",
                amountMinor: 0,
                currency: "USD",
            })
            .set("Idempotency-Key", "SMOKE");
        expect(response.status).toBe(422);
        expect(response.body).toEqual({
            code: "INVALID_AMOUNT",
            message: "El monto debe ser mayor que cero.",
        });
    });

    it("returns a safe client error for malformed JSON", async () => {
        const response = await request(createApp())
            .post("/transfers")
            .set("Content-Type", "application/json")
            .send("{");
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            code: "INVALID_REQUEST",
            message: "El cuerpo JSON no es válido.",
        });
    });

    it("does not expose internal exception details", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const response = await request(
                createApp({
                    rateProvider: {
                        getRate: () => {
                            throw new Error("private provider details");
                        },
                    },
                }),
            )
                .post("/fx-quotes")
                .send({ from: "USD", to: "COP", amountMinor: 100 })
                .expect(500);
            expect(response.body).toEqual({
                code: "INTERNAL",
                message: "Ocurrió un error interno.",
            });
        } finally {
            log.mockRestore();
        }
    });
});
