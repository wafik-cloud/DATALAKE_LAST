-- AlterTable
ALTER TABLE "pelagic_integration_settings" ADD COLUMN IF NOT EXISTS "sync_time" TEXT NOT NULL DEFAULT '01:00';
ALTER TABLE "pelagic_integration_settings" ADD COLUMN IF NOT EXISTS "sync_interval_days" INTEGER NOT NULL DEFAULT 1;
