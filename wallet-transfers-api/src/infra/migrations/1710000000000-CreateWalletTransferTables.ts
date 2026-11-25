import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWalletTransferTables1710000000000
    implements MigrationInterface
{
    name = "CreateWalletTransferTables1710000000000";

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE wallets (
                id VARCHAR(100) PRIMARY KEY,
                currency CHAR(3) NOT NULL,
                balance_minor BIGINT NOT NULL,
                locked_minor BIGINT NOT NULL DEFAULT 0,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                CONSTRAINT chk_wallet_balances CHECK (
                    balance_minor >= 0 AND balance_minor <= 9007199254740991
                    AND locked_minor >= 0 AND locked_minor <= balance_minor
                )
            ) ENGINE=InnoDB
        `);
        await queryRunner.query(`
            CREATE TABLE transfers (
                id CHAR(36) PRIMARY KEY,
                from_wallet_id VARCHAR(100) NOT NULL,
                to_wallet_id VARCHAR(100) NOT NULL,
                debited_minor BIGINT NOT NULL,
                credited_minor BIGINT NOT NULL,
                from_currency CHAR(3) NOT NULL,
                to_currency CHAR(3) NOT NULL,
                status VARCHAR(20) NOT NULL,
                created_at BIGINT NOT NULL,
                failure_reason VARCHAR(255) NULL,
                INDEX idx_transfers_from_wallet (from_wallet_id),
                INDEX idx_transfers_to_wallet (to_wallet_id)
            ) ENGINE=InnoDB
        `);
        await queryRunner.query(`
            CREATE TABLE fx_quotes (
                quote_id CHAR(36) PRIMARY KEY,
                from_currency CHAR(3) NOT NULL,
                to_currency CHAR(3) NOT NULL,
                rate DOUBLE NOT NULL,
                issued_at BIGINT NOT NULL,
                expires_at BIGINT NOT NULL,
                CONSTRAINT chk_fx_quote_rate CHECK (rate > 0),
                INDEX idx_fx_quotes_expiration (expires_at)
            ) ENGINE=InnoDB
        `);
        await queryRunner.query(`
            CREATE TABLE ledger_entries (
                id CHAR(36) PRIMARY KEY,
                transfer_id CHAR(36) NOT NULL,
                account VARCHAR(150) NOT NULL,
                amount_minor BIGINT NOT NULL,
                currency CHAR(3) NOT NULL,
                rounding_residual_numerator VARCHAR(100) NULL,
                rounding_residual_denominator VARCHAR(100) NULL,
                reverses_entry_id CHAR(36) NULL,
                created_at BIGINT NOT NULL,
                INDEX idx_ledger_transfer (transfer_id),
                INDEX idx_ledger_reversal (reverses_entry_id)
            ) ENGINE=InnoDB
        `);
        await queryRunner.query(`
            CREATE TABLE idempotency_keys (
                \`key\` VARCHAR(255) PRIMARY KEY,
                payload TEXT NOT NULL,
                result JSON NOT NULL,
                created_at BIGINT NOT NULL,
                INDEX idx_idempotency_created_at (created_at)
            ) ENGINE=InnoDB
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TABLE idempotency_keys");
        await queryRunner.query("DROP TABLE ledger_entries");
        await queryRunner.query("DROP TABLE fx_quotes");
        await queryRunner.query("DROP TABLE transfers");
        await queryRunner.query("DROP TABLE wallets");
    }
}
