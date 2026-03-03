-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "key_prefix" TEXT,
ADD COLUMN "last_used_at" TIMESTAMP(3);
