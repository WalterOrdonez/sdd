import { describe, expect, it } from "vitest";
import { TransferSaga, type SagaStep } from "../../src/application/transfer-saga.js";

describe("TransferSaga", () => {
    it("compensates completed steps in reverse order after failure", async () => {
        const events: string[] = [];
        const steps: SagaStep[] = [
            {
                name: "hold",
                execute: async () => void events.push("hold"),
                compensate: async () => void events.push("undo-hold"),
            },
            {
                name: "debit",
                execute: async () => void events.push("debit"),
                compensate: async () => void events.push("undo-debit"),
            },
            {
                name: "credit",
                execute: async () => {
                    events.push("credit");
                    throw new Error("credit failed");
                },
                compensate: async () => void events.push("undo-credit"),
            },
        ];
        const result = await new TransferSaga().execute(steps);
        expect(result.status).toBe("COMPENSADA");
        expect(events).toEqual([
            "hold",
            "debit",
            "credit",
            "undo-credit",
            "undo-debit",
            "undo-hold",
        ]);
    });

    it("marks the saga failed when a compensation also fails", async () => {
        const events: string[] = [];
        const result = await new TransferSaga().execute([
            {
                name: "debit",
                execute: async () => undefined,
                compensate: async () => {
                    events.push("undo-debit");
                    throw new Error("refund failed");
                },
            },
            {
                name: "hold",
                execute: async () => {
                    events.push("hold");
                },
                compensate: async () => {
                    events.push("undo-hold");
                },
            },
            {
                name: "credit",
                execute: async () => {
                    throw new Error("credit failed");
                },
                compensate: async () => undefined,
            },
        ]);
        expect(result.status).toBe("FALLIDA");
        expect(events).toEqual(["hold", "undo-hold", "undo-debit"]);
        if (result.status === "FALLIDA") {
            expect(result.compensationError).toBeInstanceOf(Error);
        }
    });
});
