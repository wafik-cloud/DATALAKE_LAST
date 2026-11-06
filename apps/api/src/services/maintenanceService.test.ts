import { describe, expect, it } from 'vitest';
import { observedDiskStatus, parseDf } from './maintenanceService';

const disk = { filesystem: '/dev/sdb1', mount: '/observed-disk', sizeBytes: 7_344_735_907_840, usedBytes: 15_000_000_000, availableBytes: 6_900_000_000_000, usedPercent: 1 };
const mounted = '42 25 8:17 / /observed-disk ro,nosuid,nodev,noexec,relatime - ext4 /dev/sdb1 ro,norecovery';

describe('additional storage monitoring', () => {
  it('reports the real observed volume and read-only state', () => {
    expect(observedDiskStatus([disk], mounted, '/dev/sdb1', 'Disque de 7 To')).toMatchObject({ label: 'Disque de 7 To', status: 'mounted', readOnly: true, metric: disk });
  });
  it('does not mistake an unmounted directory on the system disk for the 7 TB disk', () => {
    const fallback = { ...disk, filesystem: '/dev/sda3', sizeBytes: 22_000_000_000 };
    const mount = mounted.replace('/dev/sdb1', '/dev/sda3');
    expect(observedDiskStatus([fallback], mount, '/dev/sdb1', 'Disque de 7 To')).toMatchObject({ status: 'unavailable', metric: null });
  });
  it('requires mount identity and metrics to agree', () => {
    expect(observedDiskStatus([disk], '', '/dev/sdb1', 'Disque')).toMatchObject({ status: 'unavailable', metric: null });
    expect(observedDiskStatus([], mounted, '/dev/sdb1', 'Disque')).toMatchObject({ status: 'unavailable', metric: null });
  });
  it('distinguishes actual access modes', () => {
    expect(observedDiskStatus([disk], mounted.replace('ro,nosuid', 'rw,nosuid'), '/dev/sdb1', 'Disque').readOnly).toBe(false);
  });
  it('parses terabyte-sized values and deduplicates repeated df results', () => {
    const row = '/dev/sdb1 7172593664 15100000 6790000000 1% /observed-disk';
    const metrics = parseDf(`Filesystem 1024-blocks Used Available Capacity Mounted on\n${row}\n${row}\n`);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].sizeBytes).toBe(7_172_593_664 * 1024);
    expect(metrics[0].usedPercent).toBe(1);
  });
});
