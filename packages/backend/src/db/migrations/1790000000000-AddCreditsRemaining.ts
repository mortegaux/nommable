import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreditsRemaining1790000000000 implements MigrationInterface {
    name = 'AddCreditsRemaining1790000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "credits_remaining" integer NOT NULL DEFAULT (10)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // SQLite doesn't support DROP COLUMN in older versions, but typeorm handles or we can use safe fallback
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "credits_remaining"`);
    }
}
