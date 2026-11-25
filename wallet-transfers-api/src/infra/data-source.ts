import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { CreateWalletTransferTables1710000000000 } from "./migrations/1710000000000-CreateWalletTransferTables.js";

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}.`);
    return value;
};

export const dataSource = new DataSource({
    type: "mysql",
    host: required("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT ?? "3306"),
    username: required("MYSQL_USER"),
    password: required("MYSQL_PASSWORD"),
    database: required("MYSQL_DATABASE"),
    synchronize: false,
    migrations: [CreateWalletTransferTables1710000000000],
    migrationsTableName: "wallet_migrations",
    extra: { connectionLimit: 10 },
});

if (process.argv[1]?.endsWith("data-source.ts")) {
    await dataSource.initialize();
    try {
        await dataSource.runMigrations();
    } finally {
        await dataSource.destroy();
    }
}
