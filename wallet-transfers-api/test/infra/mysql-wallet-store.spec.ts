import { describe, expect, it, vi } from "vitest";
import type { DataSource, QueryRunner } from "typeorm";
import { MysqlWalletStore } from "../../src/infra/mysql-wallet-store.js";

describe("MysqlWalletStore", () => {
    it("locks wallet rows with SELECT FOR UPDATE inside a transaction", async () => {
        const sql: string[] = [];
        const runner = {
            isTransactionActive: true,
            connect: vi.fn(),
            startTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
            release: vi.fn(),
            query: vi.fn(async (statement: string) => {
                sql.push(statement);
                return [
                    {
                        id: "W-1",
                        currency: "USD",
                        balance_minor: "1000",
                        locked_minor: "0",
                        active: 1,
                    },
                ];
            }),
        };
        const dataSource = {
            createQueryRunner: () => runner,
        } as unknown as DataSource;
        const store = new MysqlWalletStore(dataSource);
        const wallet = await store.transaction((tx) => tx.getWallet("W-1", true));
        expect(wallet?.availableMinor).toBe(1000);
        expect(sql).toHaveLength(1);
        expect(sql[0] ?? "").toContain("SELECT id, currency");
        expect(sql[0] ?? "").toMatch(/FOR UPDATE$/);
        expect(runner.commitTransaction).toHaveBeenCalledOnce();
        expect(runner.release).toHaveBeenCalledOnce();
    });
});
