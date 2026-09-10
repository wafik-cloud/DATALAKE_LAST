import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import LoadingOverlay from '../../components/LoadingOverlay';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { showError } from '../../lib/swal';

type DiskMetric = {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
};

type MaintenanceSummary = {
  generatedAt: string;
  scope: string;
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    uptimeSeconds: number;
    timezone: string;
  };
  cpu: {
    model: string;
    logicalCores: number;
    usagePercent: number;
    loadAverage: number[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  storage: {
    root: DiskMetric | null;
    dataLake: DiskMetric | null;
    filesystems: DiskMetric[];
  };
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
  };
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value >= 100 ? 0 : 1 })} ${unit}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function toneForPercent(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'success';
}

function MetricBar({ value, tone }: { value: number; tone: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="maintenance-bar" aria-label={`${value}%`}>
      <span className={`maintenance-bar-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function MaintenancePage() {
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false, notifyErrors = true) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminApi.maintenanceSummary();
      setSummary(res.data);
    } catch (err: any) {
      if (notifyErrors) {
        await showError('Maintenance indisponible', err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true, false), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const rootDiskTone = useMemo(() => toneForPercent(summary?.storage.root?.usedPercent || 0), [summary]);
  const dataLakeDiskTone = useMemo(() => toneForPercent(summary?.storage.dataLake?.usedPercent || 0), [summary]);
  const memoryTone = useMemo(() => toneForPercent(summary?.memory.usedPercent || 0), [summary]);
  const cpuTone = useMemo(() => toneForPercent(summary?.cpu.usagePercent || 0), [summary]);

  if (loading) return <LoadingOverlay message="Chargement maintenance" submessage="Lecture des métriques serveur…" />;
  if (!summary) return <p>Synthèse maintenance indisponible</p>;

  const rootDisk = summary.storage.root;
  const dataLakeDisk = summary.storage.dataLake;
  const mainStorageDisk = dataLakeDisk || rootDisk;
  const mainStorageTone = dataLakeDisk ? dataLakeDiskTone : rootDiskTone;
  const hasCriticalResource = [cpuTone, memoryTone, rootDiskTone, dataLakeDiskTone].includes('danger');

  return (
    <div className="maintenance-page">
      <PageHeader
        title="Maintenance serveur"
        subtitle={`Dernière lecture: ${new Date(summary.generatedAt).toLocaleString('fr-FR')}`}
        actions={(
          <button type="button" className="btn" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
            Actualiser
          </button>
        )}
      />

      <div className="grid cards">
        <StatCard
          icon={<Cpu size={20} />}
          label="CPU"
          value={`${summary.cpu.usagePercent.toLocaleString('fr-FR')} %`}
          hint={`${summary.cpu.logicalCores} coeurs logiques`}
          tone={cpuTone}
        />
        <StatCard
          icon={<MemoryStick size={20} />}
          label="RAM utilisée"
          value={`${summary.memory.usedPercent.toLocaleString('fr-FR')} %`}
          hint={`${formatBytes(summary.memory.usedBytes)} / ${formatBytes(summary.memory.totalBytes)}`}
          tone={memoryTone}
        />
        <StatCard
          icon={<HardDrive size={20} />}
          label={dataLakeDisk ? 'Stockage données' : 'Stockage racine'}
          value={mainStorageDisk ? `${mainStorageDisk.usedPercent} %` : 'Indisponible'}
          hint={mainStorageDisk ? `${formatBytes(mainStorageDisk.availableBytes)} libres sur ${mainStorageDisk.mount}` : 'df indisponible'}
          tone={mainStorageDisk ? mainStorageTone : 'warning'}
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Uptime serveur"
          value={formatDuration(summary.host.uptimeSeconds)}
          hint={`${summary.host.hostname} — ${summary.scope}`}
        />
      </div>

      <section className="maintenance-grid">
        <div className="card maintenance-panel">
          <div className="section-head">
            <h2>Ressources système</h2>
            <span className={`badge ${hasCriticalResource ? 'FAILED' : 'SUCCESS'}`}>
              {hasCriticalResource ? 'Attention' : 'OK'}
            </span>
          </div>

          <div className="maintenance-metrics">
            <div>
              <div className="maintenance-row">
                <span><Cpu size={15} /> CPU actuel</span>
                <strong>{summary.cpu.usagePercent.toLocaleString('fr-FR')} %</strong>
              </div>
              <MetricBar value={summary.cpu.usagePercent} tone={cpuTone} />
            </div>
            <div>
              <div className="maintenance-row">
                <span><MemoryStick size={15} /> RAM consommée</span>
                <strong>{formatBytes(summary.memory.usedBytes)}</strong>
              </div>
              <MetricBar value={summary.memory.usedPercent} tone={memoryTone} />
              <small>{formatBytes(summary.memory.freeBytes)} libres</small>
            </div>
            {rootDisk && (
              <div>
                <div className="maintenance-row">
                  <span><HardDrive size={15} /> Stockage racine</span>
                  <strong>{formatBytes(rootDisk.usedBytes)}</strong>
                </div>
                <MetricBar value={rootDisk.usedPercent} tone={rootDiskTone} />
                <small>{formatBytes(rootDisk.availableBytes)} libres sur {formatBytes(rootDisk.sizeBytes)}</small>
              </div>
            )}
            {dataLakeDisk && (
              <div>
                <div className="maintenance-row">
                  <span><HardDrive size={15} /> Stockage données</span>
                  <strong>{formatBytes(dataLakeDisk.usedBytes)}</strong>
                </div>
                <MetricBar value={dataLakeDisk.usedPercent} tone={dataLakeDiskTone} />
                <small>{formatBytes(dataLakeDisk.availableBytes)} libres sur {formatBytes(dataLakeDisk.sizeBytes)}</small>
              </div>
            )}
          </div>
        </div>

        <div className="card maintenance-panel">
          <div className="section-head">
            <h2>Synthèse technique</h2>
            <Activity size={16} />
          </div>
          <dl className="maintenance-kv">
            <div><dt>Hôte</dt><dd>{summary.host.hostname}</dd></div>
            <div><dt>Système</dt><dd>{summary.host.platform} {summary.host.release}</dd></div>
            <div><dt>Architecture</dt><dd>{summary.host.arch}</dd></div>
            <div><dt>Fuseau</dt><dd>{summary.host.timezone || 'Non renseigné'}</dd></div>
            <div><dt>Charge 1/5/15 min</dt><dd>{summary.cpu.loadAverage.join(' / ')}</dd></div>
            <div><dt>CPU</dt><dd>{summary.cpu.model}</dd></div>
          </dl>
        </div>
      </section>

      <section className="card maintenance-panel">
        <div className="section-head">
          <h2>Systèmes de fichiers</h2>
          <Server size={16} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Montage</th>
              <th>Filesystem</th>
              <th>Utilisé</th>
              <th>Libre</th>
              <th>Taille</th>
              <th>Occupation</th>
            </tr>
          </thead>
          <tbody>
            {summary.storage.filesystems.map((disk) => {
              const tone = toneForPercent(disk.usedPercent);
              return (
                <tr key={`${disk.filesystem}-${disk.mount}`}>
                  <td>{disk.mount}</td>
                  <td>{disk.filesystem}</td>
                  <td>{formatBytes(disk.usedBytes)}</td>
                  <td>{formatBytes(disk.availableBytes)}</td>
                  <td>{formatBytes(disk.sizeBytes)}</td>
                  <td>
                    <div className="maintenance-table-bar">
                      <MetricBar value={disk.usedPercent} tone={tone} />
                      <span>{disk.usedPercent} %</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!summary.storage.filesystems.length && (
              <tr>
                <td colSpan={6}>Aucune information de stockage disponible</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="maintenance-grid">
        <div className="card maintenance-panel">
          <div className="section-head">
            <h2>Processus API</h2>
            <CheckCircle2 size={16} />
          </div>
          <dl className="maintenance-kv">
            <div><dt>PID</dt><dd>{summary.process.pid}</dd></div>
            <div><dt>Node.js</dt><dd>{summary.process.nodeVersion}</dd></div>
            <div><dt>Uptime API</dt><dd>{formatDuration(summary.process.uptimeSeconds)}</dd></div>
            <div><dt>RSS</dt><dd>{formatBytes(summary.process.memory.rssBytes)}</dd></div>
            <div><dt>Heap utilisé</dt><dd>{formatBytes(summary.process.memory.heapUsedBytes)}</dd></div>
            <div><dt>Heap total</dt><dd>{formatBytes(summary.process.memory.heapTotalBytes)}</dd></div>
          </dl>
        </div>

        <div className="card maintenance-panel">
          <div className="section-head">
            <h2>Seuils</h2>
            <AlertTriangle size={16} />
          </div>
          <div className="maintenance-thresholds">
            <span><i className="ok" /> Normal: moins de 75 %</span>
            <span><i className="warning" /> Surveillance: 75 à 89 %</span>
            <span><i className="danger" /> Critique: 90 % et plus</span>
          </div>
        </div>
      </section>
    </div>
  );
}
