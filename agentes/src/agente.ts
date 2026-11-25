import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directorioSrc = fileURLToPath(new URL(".", import.meta.url));
const directorioAgentes = resolve(directorioSrc, "..");
const directorioBilleterasMcp = resolve(directorioAgentes, "..", "billeteras-mcp");

type HerramientaTransferencia =
    | "mcp__billeteras__crear_transferencia"
    | "mcp__billeteras__crear_transferencia_con_conversion";

export type AprobarTransferencia = (
    herramienta: HerramientaTransferencia,
    entrada: Record<string, unknown>,
) => boolean | Promise<boolean>;

export async function atender(
    solicitud: string,
    aprobarTransferencia: AprobarTransferencia,
): Promise<SDKMessage[]> {
    const instrucciones = await readFile(
        new URL("../INSTRUCCIONES.md", import.meta.url),
        "utf8",
    );
    const mensajes: SDKMessage[] = [];

    const respuesta = query({
        prompt: solicitud,
        options: {
            cwd: directorioBilleterasMcp,
            systemPrompt: instrucciones,
            mcpServers: {
                billeteras: {
                    command: process.execPath,
                    args: ["--import", "tsx", "src/index.ts"],
                },
            },
            allowedTools: [
                "mcp__billeteras__consultar_saldo",
                "mcp__billeteras__cotizar",
            ],
            disallowedTools: ["Bash", "Write", "Edit"],
            maxTurns: 15,
            canUseTool: async (nombreHerramienta, entrada) => {
                if (
                    nombreHerramienta !== "mcp__billeteras__crear_transferencia" &&
                    nombreHerramienta !==
                        "mcp__billeteras__crear_transferencia_con_conversion"
                ) {
                    return {
                        behavior: "deny",
                        message: "Esta herramienta no está autorizada para el agente.",
                    };
                }

                const aprobada = await aprobarTransferencia(
                    nombreHerramienta,
                    entrada,
                );
                return aprobada
                    ? { behavior: "allow" }
                    : {
                          behavior: "deny",
                          message: "El operador no aprobó la transferencia.",
                      };
            },
        },
    });

    for await (const mensaje of respuesta) {
        mensajes.push(mensaje);
    }

    return mensajes;
}
