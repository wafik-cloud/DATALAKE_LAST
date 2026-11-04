import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Folder, FolderOpen, HardDrive, RefreshCw, Search, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { adminApi, downloadStorageObject } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

import { buildTree, collectFolderIds, findNode, rowCountLabel, type StorageObject, type TreeNode } from '../../lib/storageExplorer';

function formatBytes(value: number): string {
  if (!value) return '0 octet';
  if (value < 1024) return `${value} octets`;
  if (value < 1024 ** 2) return `${(value / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${(value / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
}

function fileIcon(_name: string) { return <FileSpreadsheet size={16} />; }

function periodLabel(node: TreeNode) {
  const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
  return node.dateFrom && node.dateTo ? `${date(node.dateFrom)} → ${date(node.dateTo)}` : 'Inconnue';
}

function statusLabel(status: string) {
  return status === 'SUCCESS' ? 'Réussi' : status === 'FAILED' ? 'Échec' : status === 'RUNNING' ? 'En cours' : 'À vérifier';
}

function TreeRow({ node, depth, expanded, selectedId, onToggle, onSelect }: {
  node: TreeNode; depth: number; expanded: Set<string>; selectedId: string;
  onToggle: (id: string) => void; onSelect: (node: TreeNode) => void;
}) {
  const isOpen = node.kind === 'folder' && expanded.has(node.id);
  return <>
    <button type="button" role="treeitem" aria-expanded={node.kind === 'folder' ? isOpen : undefined}
      className={`storage-tree-row ${selectedId === node.id ? 'selected' : ''}`}
      onClick={() => { onSelect(node); if (node.kind === 'folder') onToggle(node.id); }} title={node.id}>
      <span className="storage-tree-label" style={{ paddingLeft: `${10 + depth * 18}px` }}>
        <span className="storage-tree-chevron">{node.kind === 'folder' ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</span>
        <span className={`storage-tree-icon ${node.kind}`}>{node.kind === 'folder' ? (isOpen ? <FolderOpen size={17} /> : <Folder size={17} />) : fileIcon(node.name)}</span>
        <span className="storage-tree-name">{node.name}</span>
        {node.kind === 'folder' && <small className="storage-file-count">{node.fileCount} fichiers</small>}
      </span>
      <span className="storage-tree-number" title={node.unknownTrips ? `${node.unknownTrips} fichier(s) sans nombre de trajets connu` : undefined}>{rowCountLabel(node, 'trips')}</span>
      <span className="storage-tree-number" title={node.unknownPoints ? `${node.unknownPoints} fichier(s) sans nombre de points connu` : undefined}>{rowCountLabel(node, 'points')}</span>
      <span className="storage-tree-period" title={`${node.dateFrom || '?'} → ${node.dateTo || '?'}`}>{periodLabel(node)}</span>
      <span><span className={`badge ${node.status === 'SUCCESS' ? 'SUCCESS' : node.status === 'FAILED' ? 'FAILED' : 'WARNING'}`}>{statusLabel(node.status)}</span></span>
      <span className={`storage-tree-number ${node.errors.length ? 'storage-error-count' : ''}`} title={node.errors.length ? node.errors.map(e => e.message).join(' — ') : 'Aucune tentative en échec associée'}>{node.errors.length.toLocaleString('fr-FR')}</span>
      <span className="storage-tree-meta">{formatBytes(node.size)}</span>
    </button>
    {isOpen && node.children.map((child) => <TreeRow key={`${child.kind}-${child.id}`} node={child} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} />)}
  </>;
}

export default function FilesPage() {
  const [items, setItems] = useState<StorageObject[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metadataWarnings, setMetadataWarnings] = useState(0);
  const [preview, setPreview] = useState<{ content: string; truncated: boolean; previewBytes: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    try {
      const res = await adminApi.storageExplorer();
      const loadedItems = res.data.items as StorageObject[];
      setItems(loadedItems);
      setMetadataWarnings(res.data.unreadableMetadata || 0);
      setExpanded(new Set(collectFolderIds(buildTree(loadedItems)).filter(id => id.split('/').length < 3)));
    }
    catch (error: any) { setLoadError(error.response?.data?.error || 'Chargement de l’explorateur impossible. Réessayez.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr');
    return normalized ? items.filter((item) => item.key.toLocaleLowerCase('fr').includes(normalized)) : items;
  }, [items, query]);
  const tree = useMemo(() => buildTree(filteredItems), [filteredItems]);
  const selected = useMemo(() => selectedId ? findNode(tree, selectedId) : null, [tree, selectedId]);
  const folderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const totalSize = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.size || 0), 0), [filteredItems]);

  useEffect(() => { if (query.trim()) setExpanded(new Set(folderIds)); }, [query, folderIds.join('|')]);

  useEffect(() => {
    if (selected?.kind !== 'file' || !selected.item) { setPreview(null); setPreviewError(null); return; }
    let cancelled = false;
    setPreviewLoading(true); setPreview(null); setPreviewError(null);
    adminApi.storageObjectPreview(selected.item.key)
      .then((response) => { if (!cancelled) setPreview(response.data); })
      .catch((error) => { if (!cancelled) setPreviewError(error.response?.data?.error || 'Aperçu indisponible'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  const csvPreview = useMemo(() => {
    if (!preview || !selected?.name.toLowerCase().endsWith('.csv')) return null;
    return Papa.parse<string[]>(preview.content, { skipEmptyLines: true }).data;
  }, [preview, selected?.name]);

  const formattedPreview = useMemo(() => {
    if (!preview || !selected?.name.toLowerCase().endsWith('.json')) return preview?.content || '';
    try { return JSON.stringify(JSON.parse(preview.content), null, 2); } catch { return preview.content; }
  }, [preview, selected?.name]);

  function toggleFolder(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function downloadFile(key: string) {
    try { await downloadStorageObject(key); }
    catch (err: any) { await showError('Téléchargement impossible', err.response?.data?.error); }
  }

  async function removeFile(key: string) {
    const ok = await confirmAction('Supprimer le fichier', key, 'Supprimer');
    if (!ok) return;
    try {
      await withLoading(() => adminApi.storageDelete(key), 'Suppression', 'Suppression du fichier…');
      setSelectedId(''); await showSuccess('Fichier supprimé'); load();
    } catch (err: any) { await showError('Suppression échouée', err.response?.data?.error); }
  }

  return <div className="files-page">
    <PageHeader title="Explorateur de données" subtitle="Fichiers de trajets et de points GPS · synthèse par fichier, mois et année"
      actions={<button type="button" className="btn" onClick={load}><RefreshCw size={16} /> Actualiser</button>} />

    <div className="storage-summary-bar">
      <span><HardDrive size={16} /><strong>pelagic-data</strong></span>
      <span>{filteredItems.length.toLocaleString('fr-FR')} fichiers CSV</span><span>{formatBytes(totalSize)} stockés</span>
      <span><strong>{rowCountLabel(tree, 'trips')}</strong> trajets</span>
      <span><strong>{rowCountLabel(tree, 'points')}</strong> points GPS</span>
    </div>

    {loadError && <div className="alert" role="alert">{loadError}</div>}
    {metadataWarnings > 0 && <div className="alert" role="status">{metadataWarnings} manifeste(s) ou journal(aux) illisible(s). Les informations disponibles dans l’historique des imports sont utilisées.</div>}
    <p className="storage-summary-note">Totaux des lignes des fichiers affichés, sans dédoublonnage entre exports. Les échecs passés indiquent les tentatives échouées pour la même période et les mêmes filtres.</p>
    <section className="storage-explorer">
      <div className="storage-explorer-toolbar">
        <label className="storage-search"><Search size={15} /><input placeholder="Rechercher un dossier ou un fichier" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="actions"><button type="button" className="btn sm" onClick={() => setExpanded(new Set(folderIds))}>Tout développer</button><button type="button" className="btn sm" onClick={() => setExpanded(new Set())}>Tout réduire</button></div>
      </div>

      {loading ? <LoadingOverlay message="Chargement des fichiers" /> : <>
      <div className="storage-explorer-body">
        <div className="storage-tree" role="tree" aria-label="Arborescence du stockage">
          <div className="storage-tree-header"><span>Nom</span><span>Trajets</span><span>Points GPS</span><span>Période couverte</span><span>Import</span><span>Échecs passés</span><span>Taille</span></div>
          {tree.children.length ? tree.children.map((node) => <TreeRow key={`${node.kind}-${node.id}`} node={node} depth={0} expanded={expanded} selectedId={selected?.id || ''} onToggle={toggleFolder} onSelect={(node) => setSelectedId(node.id)} />) : <div className="storage-empty">Aucun fichier ne correspond à la recherche.</div>}
        </div>

        <aside className="storage-details">
          {selected ? <>
            <div className={`storage-detail-icon ${selected.kind}`}>{selected.kind === 'folder' ? <FolderOpen size={28} /> : fileIcon(selected.name)}</div>
            <h2>{selected.name}</h2><p className="storage-detail-path">{selected.id}</p>
            <dl>
              <div><dt>Type</dt><dd>{selected.kind === 'folder' ? 'Dossier logique' : selected.name.split('.').pop()?.toUpperCase() || 'Fichier'}</dd></div>
              <div><dt>Trajets</dt><dd>{rowCountLabel(selected, 'trips')}</dd></div>
              <div><dt>Points GPS</dt><dd>{rowCountLabel(selected, 'points')}</dd></div>
              <div><dt>Du</dt><dd>{selected.dateFrom || 'Inconnu'}</dd></div>
              <div><dt>Au</dt><dd>{selected.dateTo || 'Inconnu'}</dd></div>
              <div><dt>Import</dt><dd>{statusLabel(selected.status)}</dd></div>
              <div><dt>Échecs passés</dt><dd>{selected.errors.length}</dd></div>
              {selected.item && <div><dt>Source</dt><dd>{selected.item.metadataSource === 'manifest' ? 'Manifeste' : selected.item.metadataSource === 'history' ? 'Historique des imports (manifeste absent)' : 'Métadonnées indisponibles'}</dd></div>}
              {selected.item?.rowCountVerifiedAt && <div><dt>Compteur</dt><dd>Vérifié dans le CSV le {new Date(selected.item.rowCountVerifiedAt).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</dd></div>}
              {selected.item?.importedAt && <div><dt>Importé le</dt><dd>{new Date(selected.item.importedAt).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} (Casablanca)</dd></div>}
              {selected.item?.unmatchedBoatCount != null && <div><dt>Bateaux non associés</dt><dd>{selected.item.unmatchedBoatCount}</dd></div>}
              <div><dt>Taille</dt><dd>{formatBytes(selected.size)}</dd></div>
              {selected.kind === 'folder' && <div><dt>Contenu</dt><dd>{selected.fileCount} fichier(s)</dd></div>}
              {selected.item?.lastModified && <div><dt>Modifié</dt><dd>{new Date(selected.item.lastModified).toLocaleString('fr-FR')}</dd></div>}
            </dl>
            {selected.errors.length > 0 && <div className="storage-import-errors"><strong>Tentatives en échec associées</strong><ul>{selected.errors.map(error => <li key={error.id}>{error.at && <small>{new Date(error.at).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} — </small>}{error.message}</li>)}</ul></div>}
            {selected.kind === 'file' && selected.item && <div className="storage-detail-actions"><button type="button" className="btn primary" onClick={() => downloadFile(selected.item!.key)}><Download size={15} /> Télécharger</button><button type="button" className="btn danger" onClick={() => removeFile(selected.item!.key)}><Trash2 size={15} /> Supprimer</button></div>}
          </> : <div className="storage-detail-empty"><Folder size={34} /><strong>Sélectionnez un élément</strong><span>Les informations du dossier ou du fichier apparaîtront ici.</span></div>}
        </aside>
      </div>
      {selected?.kind === 'file' && <div className="storage-preview-panel">
        <div className="storage-preview-header"><div><h2>Aperçu des données</h2><p>{selected.id}</p></div>{preview?.truncated && <span className="badge WARNING">Extrait limité</span>}</div>
        {previewLoading && <div className="storage-preview-state">Lecture sécurisée du fichier…</div>}
        {previewError && <div className="alert">{previewError}</div>}
        {!previewLoading && !previewError && csvPreview && <div className="storage-preview-table"><table className="data-table compact"><thead><tr>{(csvPreview[0] || []).map((cell, index) => <th key={`${cell}-${index}`}>{cell || `Colonne ${index + 1}`}</th>)}</tr></thead><tbody>{csvPreview.slice(1, 51).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell || '—'}</td>)}</tr>)}</tbody></table></div>}
        {!previewLoading && !previewError && preview && !csvPreview && <pre className="storage-preview-code">{formattedPreview}</pre>}
      </div>}
      </>}
    </section>
  </div>;
}
