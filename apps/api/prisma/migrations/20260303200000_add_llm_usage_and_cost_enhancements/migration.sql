-- AlterTable: Add llm_usd and source columns to CostEntry
ALTER TABLE "CostEntry" ADD COLUMN "llm_usd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CostEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'estimated';

-- CreateTable: LlmUsageEntry for per-request LLM API usage tracking
CREATE TABLE "LlmUsageEntry" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "capture_tier" TEXT,
    "trace_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "LlmUsageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsageEntry_instance_id_timestamp_idx" ON "LlmUsageEntry"("instance_id", "timestamp");
CREATE INDEX "LlmUsageEntry_timestamp_idx" ON "LlmUsageEntry"("timestamp");
CREATE INDEX "LlmUsageEntry_provider_model_idx" ON "LlmUsageEntry"("provider", "model");

-- AddForeignKey
ALTER TABLE "LlmUsageEntry" ADD CONSTRAINT "LlmUsageEntry_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Convert LlmUsageEntry to TimescaleDB hypertable (best-effort; no-op if TimescaleDB is unavailable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Drop the default PK so we can create a composite one
    ALTER TABLE "LlmUsageEntry" DROP CONSTRAINT "LlmUsageEntry_pkey";
    ALTER TABLE "LlmUsageEntry" ADD PRIMARY KEY ("id", "timestamp");
    PERFORM create_hypertable('"LlmUsageEntry"', 'timestamp', migrate_data => true);
  END IF;
END $$;
