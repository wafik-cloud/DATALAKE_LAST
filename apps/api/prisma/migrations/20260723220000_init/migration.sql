-- CreateEnum
CREATE TYPE "PelagicExportType" AS ENUM ('trips', 'points');

-- CreateEnum
CREATE TYPE "PelagicJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pelagic_import_jobs" (
    "id" TEXT NOT NULL,
    "job_uuid" TEXT NOT NULL,
    "export_type" "PelagicExportType" NOT NULL,
    "date_from" TEXT NOT NULL,
    "date_to" TEXT NOT NULL,
    "imeis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "device_info" BOOLEAN NOT NULL DEFAULT true,
    "with_last_seen" BOOLEAN NOT NULL DEFAULT true,
    "include_errant" BOOLEAN NOT NULL DEFAULT false,
    "status" "PelagicJobStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "minio_bucket" TEXT,
    "minio_object_key" TEXT,
    "file_name" TEXT,
    "file_size" BIGINT,
    "checksum_sha256" TEXT,
    "http_status" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "row_count" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelagic_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pelagic_import_jobs_job_uuid_key" ON "pelagic_import_jobs"("job_uuid");

-- CreateIndex
CREATE INDEX "pelagic_import_jobs_status_idx" ON "pelagic_import_jobs"("status");

-- CreateIndex
CREATE INDEX "pelagic_import_jobs_export_type_date_from_date_to_idx" ON "pelagic_import_jobs"("export_type", "date_from", "date_to");
