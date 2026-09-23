CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "ScheduleRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

CREATE TABLE "pelagic_schedules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'DAILY',
  "cron" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
  "export_types" "PelagicExportType"[] DEFAULT ARRAY['trips', 'points']::"PelagicExportType"[],
  "interval_days" INTEGER NOT NULL DEFAULT 1,
  "start_date" TEXT,
  "end_date" TEXT,
  "imeis" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "device_info" BOOLEAN NOT NULL DEFAULT true,
  "with_last_seen" BOOLEAN NOT NULL DEFAULT true,
  "include_errant" BOOLEAN NOT NULL DEFAULT false,
  "catchup_missing" BOOLEAN NOT NULL DEFAULT true,
  "max_retries" INTEGER NOT NULL DEFAULT 3,
  "last_run_at" TIMESTAMP(3),
  "last_run_status" "ScheduleRunStatus",
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pelagic_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pelagic_schedule_runs" (
  "id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "status" "ScheduleRunStatus" NOT NULL DEFAULT 'RUNNING',
  "date_from" TEXT NOT NULL,
  "date_to" TEXT NOT NULL,
  "jobs_created" INTEGER NOT NULL DEFAULT 0,
  "jobs_skipped" INTEGER NOT NULL DEFAULT 0,
  "jobs_failed" INTEGER NOT NULL DEFAULT 0,
  "rows_imported" INTEGER NOT NULL DEFAULT 0,
  "bytes_imported" BIGINT NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "pelagic_schedule_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pelagic_import_jobs" ADD COLUMN "schedule_run_id" TEXT;
CREATE INDEX "pelagic_schedules_enabled_idx" ON "pelagic_schedules"("enabled");
CREATE INDEX "pelagic_schedule_runs_schedule_id_started_at_idx" ON "pelagic_schedule_runs"("schedule_id", "started_at");
CREATE INDEX "pelagic_schedule_runs_status_idx" ON "pelagic_schedule_runs"("status");
ALTER TABLE "pelagic_schedule_runs" ADD CONSTRAINT "pelagic_schedule_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "pelagic_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelagic_import_jobs" ADD CONSTRAINT "pelagic_import_jobs_schedule_run_id_fkey" FOREIGN KEY ("schedule_run_id") REFERENCES "pelagic_schedule_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
