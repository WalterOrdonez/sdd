import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

serveStdio(createServer);
console.error("billeteras MCP listo (stdio)");
