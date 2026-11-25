import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { readFile } from "node:fs/promises";
import {
    createFxQuote,
    createFxTransfer,
    createTransfer,
    getWalletBalance,
} from "./wallet-transfers-api.js";

const idempotencyKeySchema = z
    .string()
    .min(1)
    .max(255)
    .describe(
        "Clave única de la operación. Reutilízala solo para reintentar exactamente la misma transferencia.",
    );

function apiError(error: unknown) {
    return {
        isError: true,
        content: [
            {
                type: "text" as const,
                text:
                    error instanceof Error
                        ? error.message
                        : "Error inesperado al consultar Wallet Transfers API.",
            },
        ],
    };
}

function createServer(): McpServer {
    const server = new McpServer({ name: "billeteras", version: "1.0.0" });
    server.registerTool(
        "consultar_saldo",
        {
            description: "Consulta el saldo de una billetera, en centavos.",
            inputSchema: z.object({
                billeteraId: z
                    .string()
                    .describe("ID de la billetera, ej. W-001"),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ billeteraId }) => {
            try {
                const billetera = await getWalletBalance(billeteraId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Saldo: ${billetera.balanceMinor} centavos ${billetera.currency} (disponible: ${billetera.availableMinor} centavos)`,
                        },
                    ],
                };
            } catch (error) {
                return apiError(error);
            }
        },
    );

    server.registerTool(
        "cotizar",
        {
            description:
                "Cotiza una conversión y estima el monto destino. La cotización es válida por 60 segundos.",
            inputSchema: z.object({
                origen: z
                    .enum(["USD", "EUR", "COP"])
                    .describe("Moneda de origen, ej. USD"),
                destino: z
                    .enum(["USD", "EUR", "COP"])
                    .describe("Moneda de destino, ej. EUR"),
                monto: z
                    .number()
                    .int()
                    .positive()
                    .describe("centavos de origen"),
            }),
            outputSchema: z.object({
                cotizacionId: z.string().describe("ID de la cotización"),
                tasa: z.number().describe("Tasa de cambio"),
                montoDestino: z
                    .number()
                    .int()
                    .describe("Monto en la moneda de destino"),
                expiraEn: z
                    .string()
                    .describe("Tiempo de expiración de la cotización"),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ origen, destino, monto }) => {
            try {
                const quote = await createFxQuote({
                    from: origen,
                    to: destino,
                    amountMinor: monto,
                });
                const result = {
                    cotizacionId: quote.quoteId,
                    tasa: quote.rate,
                    montoDestino: quote.estimatedAmountMinor,
                    expiraEn: new Date(quote.expiresAt).toISOString(),
                };
                return {
                    structuredContent: result,
                    content: [{ type: "text", text: JSON.stringify(result) }],
                };
            } catch (error) {
                return apiError(error);
            }
        },
    );

    server.registerTool(
        "crear_transferencia",
        {
            description:
                "Transfiere entre dos billeteras de la misma moneda. Es idempotente por idempotencyKey.",
            inputSchema: z.object({
                origenId: z.string().describe("ID de la billetera origen, ej. W-001"),
                destinoId: z.string().describe("ID de la billetera destino"),
                monto: z.number().int().positive().describe("centavos a transferir"),
                moneda: z
                    .enum(["USD", "EUR", "COP"])
                    .describe("Moneda de ambas billeteras"),
                idempotencyKey: idempotencyKeySchema,
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
            },
        },
        async ({ origenId, destinoId, monto, moneda, idempotencyKey }) => {
            try {
                const result = await createTransfer(
                    {
                        fromWalletId: origenId,
                        toWalletId: destinoId,
                        amountMinor: monto,
                        currency: moneda,
                    },
                    idempotencyKey,
                );
                return {
                    content: [{ type: "text", text: JSON.stringify(result) }],
                };
            } catch (error) {
                return apiError(error);
            }
        },
    );

    server.registerTool(
        "crear_transferencia_con_conversion",
        {
            description:
                "Transfiere entre billeteras de distinta moneda usando un cotizacionId vigente de cotizar (60 s). No recotiza si expiró. Es idempotente por idempotencyKey.",
            inputSchema: z.object({
                origenId: z.string().describe("ID de la billetera origen, ej. W-001"),
                destinoId: z.string().describe("ID de la billetera destino"),
                monto: z
                    .number()
                    .int()
                    .positive()
                    .describe("centavos en la moneda de origen"),
                cotizacionId: z.string().describe("ID devuelto por cotizar"),
                idempotencyKey: idempotencyKeySchema,
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
            },
        },
        async ({ origenId, destinoId, monto, cotizacionId, idempotencyKey }) => {
            try {
                const result = await createFxTransfer(
                    {
                        fromWalletId: origenId,
                        toWalletId: destinoId,
                        amountMinor: monto,
                        quoteId: cotizacionId,
                    },
                    idempotencyKey,
                );
                return {
                    content: [{ type: "text", text: JSON.stringify(result) }],
                };
            } catch (error) {
                return apiError(error);
            }
        },
    );

    server.registerResource(
        "spec-transferencias",
        "specs://SPEC-TRANSFER-SAME-CURRENCY",
        { title: "Transferencias Same Currency", mimeType: "text/markdown" },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    text: await readFile(
                        ".specs/features/SPEC-001-transferencia-misma-moneda.md",
                        "utf8",
                    ),
                },
            ],
        }),
    );

    server.registerPrompt(
        "auditar_transferencia",
        {
            description: "Revisa una transferencia contra las invariantes",
            argsSchema: z.object({
                transferenciaId: z
                    .string()
                    .describe("ID de la transferencia, ej. T-001"),
            }),
        },
        ({ transferenciaId }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Lee specs://SPEC-TRANSFER-SAME-CURRENCY y audita la transferencia ${transferenciaId} contra cada invariante`,
                    },
                },
            ],
        }),
    );

    return server;
}

export { createServer };
