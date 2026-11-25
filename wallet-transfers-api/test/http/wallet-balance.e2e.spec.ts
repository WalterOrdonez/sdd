import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { makeFxStore } from "../helpers.js";

describe("Wallet balance endpoint", () => {
    it("returns the stored balance, currency, and available amount", async () => {
        const store = await makeFxStore();
        const response = await request(createApp({ store }))
            .get("/wallets/W-ORIGEN")
            .expect(200);

        expect(response.body).toEqual({
            walletId: "W-ORIGEN",
            currency: "USD",
            balanceMinor: 10_000,
            availableMinor: 10_000,
        });
    });

    it("returns a business error for a missing wallet", async () => {
        const response = await request(createApp({ store: await makeFxStore() }))
            .get("/wallets/UNKNOWN")
            .expect(422);

        expect(response.body.code).toBe("WALLET_NOT_FOUND");
    });
});
