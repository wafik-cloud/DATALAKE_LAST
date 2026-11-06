import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type CpuTimes = {
  idle: number;
  total: number;
};

export type DiskMetric = {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
};

function bytesFromKilobytes(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * 1024 : 0;
}

function cpuTimes(): CpuTimes {
  return os.cpus().reduce<CpuTimes>(
    (total, cpu) => {
      const values = Object.values(cpu.times);
      const cpuTotal = values.reduce((sum, value) => sum + value, 0);
      return {
        idle: total.idle + cpu.times.idle,
        total: total.total + cpuTotal,
      };
    },
    { idle: 0, total: 0 }
  );
}

async function sampleCpuUsage(intervalMs = 350): Promise<number> {
  const start = cpuTimes();
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  const end = cpuTimes();
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

export function parseDf(output: string): DiskMetric[] {
  const rows = output.trim().split('\n').slice(1);
  const seen = new Set<string>();

  return rows
    .map((row) => row.trim().split(/\s+/))
    .filter((columns) => columns.length >= 6)
    .map((columns) => {
      const [filesystem, size, used, available, percent, ...mountParts] = columns;
      const mount = mountParts.join(' ');
      return {
        filesystem,
        mount,
        sizeBytes: bytesFromKilobytes(size),
        usedBytes: bytesFromKilobytes(used),
        availableBytes: bytesFromKilobytes(available),
        usedPercent: Number(percent.replace('%', '')) || 0,
      };
    })
    .filter((metric) => {
      const key = `${metric.filesystem}:${metric.mount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return metric.sizeBytes > 0;
    });
}

export function observedDiskStatus(disks: DiskMetric[], mountInfo: string, expectedSource: string, label: string) {
  const mount = mountInfo.split('\n').map(line => line.split(' - ')).find(([fields]) => fields?.split(' ')[4] === '/observed-disk');
  const source = mount?.[1]?.split(' ')[1];
  const readOnly = mount?.[0]?.split(' ')[5]?.split(',').includes('ro') || false;
  const metric = disks.find(disk => disk.mount === '/observed-disk' && disk.filesystem === expectedSource) || null;
  const available = Boolean(source === expectedSource && metric);
  return { label, source: expectedSource, status: available ? 'mounted' : 'unavailable', readOnly, metric: available ? metric : null };
}

async function readDisks(observeDisk: boolean): Promise<DiskMetric[]> {
  const paths = ['/', '/datalake', '/app', '/tmp', ...(observeDisk ? ['/observed-disk'] : [])];
  // A missing optional mount must not suppress the other storage metrics.
  const groups = await Promise.all(paths.map(async path => {
    try {
      const { stdout } = await execFileAsync('df', ['-Pk', path], { timeout: 5000 });
      return parseDf(stdout);
    } catch { return []; }
  }));
  return [...new Map(groups.flat().map(disk => [`${disk.filesystem}:${disk.mount}`, disk])).values()];
}

export async function getMaintenanceSummary() {
  const expectedSource = process.env.OBSERVED_DISK_SOURCE?.trim() || '';
  const [cpuUsagePercent, rawDisks] = await Promise.all([sampleCpuUsage(), readDisks(Boolean(expectedSource))]);
  let mountInfo = '';
  if (expectedSource) {
    try { mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8'); } catch { /* Report unavailable if the mount cannot be verified. */ }
  }
  const observedDisk = expectedSource ? observedDiskStatus(rawDisks, mountInfo, expectedSource, process.env.OBSERVED_DISK_LABEL || 'Disque supplémentaire') : null;
  const disks = rawDisks.filter(disk => disk.mount !== '/observed-disk' || observedDisk?.status === 'mounted');
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
  const rootDisk = disks.find((disk) => disk.mount === '/') || disks[0] || null;
  const dataLakeDisk = disks.find((disk) => disk.mount === '/datalake') || null;
  const processMemory = process.memoryUsage();

  return {
    generatedAt: new Date().toISOString(),
    scope: fs.existsSync('/.dockerenv') ? 'docker-runtime' : 'host-runtime',
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSeconds: os.uptime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    cpu: {
      model: os.cpus()[0]?.model || 'CPU',
      logicalCores: os.cpus().length,
      usagePercent: Number(cpuUsagePercent.toFixed(1)),
      loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    },
    memory: {
      totalBytes: totalMemoryBytes,
      usedBytes: usedMemoryBytes,
      freeBytes: freeMemoryBytes,
      usedPercent: Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(1)),
    },
    storage: {
      root: rootDisk,
      dataLake: dataLakeDisk,
      filesystems: disks,
      observedDisk,
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: process.uptime(),
      memory: {
        rssBytes: processMemory.rss,
        heapUsedBytes: processMemory.heapUsed,
        heapTotalBytes: processMemory.heapTotal,
        externalBytes: processMemory.external,
      },
    },
  };
}
