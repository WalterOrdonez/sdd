import "dotenv/config";
import { createApp } from "./app.js";
import { dataSource } from "./infra/data-source.js";
import { MysqlWalletStore } from "./infra/mysql-wallet-store.js";

export async function startServer(): Promise<void> {
    await dataSource.initialize();
    try {
        await dataSource.runMigrations();
    } catch (error) {
        await dataSource.destroy();
        throw error;
    }
    const port = Number(process.env.PORT ?? "3000");
    const app = createApp({ store: new MysqlWalletStore(dataSource) });
    const server = app.listen(port, () => {
        console.log(`Wallet Transfers API listening on port ${port}`);
    });
    const shutdown = async (): Promise<void> => {
        server.close(async () => {
            await dataSource.destroy();
            process.exitCode = 0;
        });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
    startServer().catch((error: unknown) => {
        console.error("Unable to start Wallet Transfers API", error);
        process.exitCode = 1;
    });
}
