-- CreateTable
CREATE TABLE "pelagic_integration_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_cron" TEXT NOT NULL DEFAULT '0 2 * * *',
    "sync_timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "default_imeis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "device_info" BOOLEAN NOT NULL DEFAULT true,
    "with_last_seen" BOOLEAN NOT NULL DEFAULT true,
    "include_errant" BOOLEAN NOT NULL DEFAULT false,
    "retention_days" INTEGER,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelagic_integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");
