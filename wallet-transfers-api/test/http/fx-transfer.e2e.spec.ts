import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createFxQuote } from "../../src/domain/fx-quote.js";
import { makeFxStore } from "../helpers.js";

describe("FX quote and transfer endpoints", () => {
    it("rejects a same-currency quote before looking up a rate", async () => {
        const response = await request(createApp())
            .post("/fx-quotes")
            .send({ from: "USD", to: "USD", amountMinor: 100 })
            .expect(422);
        expect(response.body.code).toBe("CURRENCY_MISMATCH");
    });

    it("issues a server-timed quote and completes the quoted conversion", async () => {
        const store = await makeFxStore();
        const app = createApp({
            store,
            rateProvider: { getRate: () => 4000 },
        });
        const quoteResponse = await request(app)
            .post("/fx-quotes")
            .send({ from: "USD", to: "COP", amountMinor: 3000 })
            .expect(201);
        expect(quoteResponse.body).toMatchObject({
            from: "USD",
            to: "COP",
            rate: 4000,
            amountMinor: 3000,
            estimatedAmountMinor: 12_000_000,
        });
        expect(quoteResponse.body.expiresAt - quoteResponse.body.issuedAt).toBeLessThanOrEqual(
            60_000,
        );
        const response = await request(app)
            .post("/fx-transfers")
            .set("Idempotency-Key", "FX-HTTP-1")
            .send({
                fromWalletId: "W-ORIGEN",
                toWalletId: "W-COP",
                amountMinor: 3000,
                quoteId: quoteResponse.body.quoteId,
            })
            .expect(201);
        expect(response.body).toMatchObject({
            status: "COMPLETADA",
            debitedMinor: 3000,
            creditedMinor: 12_000_000,
            rate: 4000,
        });
    });

    it("rejects a quote with a non-positive amount", async () => {
        const response = await request(createApp())
            .post("/fx-quotes")
            .send({ from: "USD", to: "COP", amountMinor: 0 })
            .expect(422);
        expect(response.body.code).toBe("INVALID_AMOUNT");
    });

    it("rejects expired quotes and never silently refreshes them", async () => {
        const store = await makeFxStore();
        const quote = createFxQuote("USD", "COP", 4000, 1_000);
        await store.seedQuote(quote);
        const response = await request(createApp({ store }))
            .post("/fx-transfers")
            .set("Idempotency-Key", "EXPIRED-HTTP")
            .send({
                fromWalletId: "W-ORIGEN",
                toWalletId: "W-COP",
                amountMinor: 3000,
                quoteId: quote.quoteId,
            })
            .expect(422);
        expect(response.body.code).toBe("QUOTE_EXPIRED");
        expect((await store.getWallet("W-ORIGEN"))?.balanceMinor).toBe(10_000);
    });
});
