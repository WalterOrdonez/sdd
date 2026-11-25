import type { QueryRunner } from "typeorm";
import type { TransactionContext } from "./wallet-store.js";

export async function executeInQueryRunner<T>(
    queryRunner: QueryRunner,
    work: (tx: TransactionContext) => Promise<T>,
    createContext: (runner: QueryRunner) => TransactionContext,
): Promise<T> {
    let connected = false;
    try {
        await queryRunner.connect();
        connected = true;
        await queryRunner.startTransaction();
        const result = await work(createContext(queryRunner));
        await queryRunner.commitTransaction();
        return result;
    } catch (error) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        throw error;
    } finally {
        if (connected) await queryRunner.release();
    }
}
