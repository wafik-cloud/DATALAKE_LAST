import type { PelagicImportJob } from '@prisma/client';

export function serializeJob<T extends { fileSize?: bigint | null }>(job: T) {
  return {
    ...job,
    fileSize: job.fileSize != null ? job.fileSize.toString() : job.fileSize,
  };
}

export function serializeSyncRun(run: {
  results: Array<{ job?: PelagicImportJob | null; skipped?: boolean; message?: string; manifestKey?: string }>;
  failures: unknown[];
}) {
  return {
    results: run.results.map((result) =>
      result.job ? { ...result, job: serializeJob(result.job) } : result
    ),
    failures: run.failures,
  };
}
