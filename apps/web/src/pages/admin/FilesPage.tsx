import { useEffect, useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

export default function FilesPage() {
  const [prefix, setPrefix] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.storageObjects(prefix);
      setItems(res.data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function removeFile(key: string) {
    const ok = await confirmAction('Supprimer le fichier', key, 'Supprimer');
    if (!ok) return;
    try {
      await withLoading(() => adminApi.storageDelete(key), 'Suppression', 'Suppression du fichier…');
      await showSuccess('Fichier supprimé');
      load();
    } catch (err: any) {
      await showError('Suppression échouée', err.response?.data?.error);
    }
  }

  return (
    <div>
      <PageHeader
        title="Fichiers stockés"
        subtitle="Exploration du bucket MinIO Pelagic"
        actions={<button type="button" className="btn" onClick={load}><RefreshCw size={16} /> Actualiser</button>}
      />
      <div className="erp-table-panel card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="filters">
        <input placeholder="Préfixe (ex: trips/2026/)" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        <button className="btn" onClick={load}>Filtrer</button>
      </div>
      {loading ? <LoadingOverlay message="Chargement des fichiers" /> : (
        <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Chemin</th><th>Taille</th><th>Modifié</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>{item.key}</td>
                <td>{item.size ? `${(item.size / 1024).toFixed(1)} Ko` : '—'}</td>
                <td>{item.lastModified ? new Date(item.lastModified).toLocaleString('fr-FR') : '—'}</td>
                <td className="actions-cell">
                  <button type="button" className="btn sm" onClick={async () => {
                    const r = await adminApi.storageDownload(item.key);
                    window.open(r.data.url, '_blank');
                  }}><Download size={14} /> URL</button>
                  <button type="button" className="btn sm danger" onClick={() => removeFile(item.key)}>
                    <Trash2 size={14} /> Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      </div>
    </div>
  );
}
