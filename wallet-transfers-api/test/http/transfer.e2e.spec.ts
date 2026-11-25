import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { Wallet } from "../../src/domain/wallet.entity.js";
import { makeSameCurrencyStore } from "../helpers.js";

describe("POST /transfers", () => {
    it("completes, retries idempotently and rejects a conflicting payload", async () => {
        const store = await makeSameCurrencyStore();
        const app = createApp({ store });
        const body = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-DESTINO",
            amountMinor: 3000,
            currency: "USD",
        };
        const first = await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "HTTP-1")
            .send(body)
            .expect(201);
        const retry = await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "HTTP-1")
            .send(body)
            .expect(201);
        expect(retry.body).toEqual(first.body);
        expect(await store.getLedgerEntries(first.body.transferId)).toHaveLength(2);
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "HTTP-1")
            .send({ ...body, amountMinor: 2000 })
            .expect(409, {
                code: "IDEMPOTENCY_CONFLICT",
                message: "La clave ya se usó con otra solicitud.",
            });
    });

    it("covers input, wallet, currency and available-balance rejection rules", async () => {
        const store = await makeSameCurrencyStore();
        await store.seedWallet(
            new Wallet({
                id: "W-EUR",
                currency: "EUR",
                balanceMinor: 0,
                lockedMinor: 0,
                active: true,
            }),
        );
        const app = createApp({ store });
        const base = {
            fromWalletId: "W-ORIGEN",
            toWalletId: "W-DESTINO",
            amountMinor: 1000,
            currency: "USD",
        };
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "BAD-CURRENCY")
            .send({ ...base, currency: "usd" })
            .expect(422, {
                code: "UNSUPPORTED_CURRENCY",
                message: "La moneda no está soportada.",
            });
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "EMPTY-CURRENCY")
            .send({ ...base, currency: "" })
            .expect(422, {
                code: "UNSUPPORTED_CURRENCY",
                message: "La moneda no está soportada.",
            });
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "SAME")
            .send({ ...base, toWalletId: "W-ORIGEN" })
            .expect(422, {
                code: "SAME_WALLET",
                message: "El origen y el destino deben ser distintos.",
            });
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "MISSING")
            .send({ ...base, toWalletId: "W-MISSING" })
            .expect(422, {
                code: "WALLET_NOT_FOUND",
                message: "Una de las billeteras no existe o no está activa.",
            });
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "MISMATCH")
            .send({ ...base, toWalletId: "W-EUR" })
            .expect(422, {
                code: "CURRENCY_MISMATCH",
                message: "Las billeteras y la solicitud deben usar la misma moneda.",
            });
        await request(app)
            .post("/transfers")
            .set("Idempotency-Key", "FUNDS")
            .send({ ...base, amountMinor: 15_000 })
            .expect(422, {
                code: "INSUFFICIENT_FUNDS",
                message: "El saldo disponible es insuficiente.",
            });
    });

    it("requires the idempotency header", async () => {
        const response = await request(createApp())
            .post("/transfers")
            .send({
                fromWalletId: "A",
                toWalletId: "B",
                amountMinor: 1,
                currency: "USD",
            })
            .expect(400);
        expect(response.body.code).toBe("INVALID_REQUEST");
    });
});
