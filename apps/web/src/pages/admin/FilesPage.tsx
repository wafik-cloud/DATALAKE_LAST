import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileJson, FileSpreadsheet, FileText, Folder, FolderOpen, HardDrive, RefreshCw, Search, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { adminApi, downloadStorageObject } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

type StorageObject = { key: string; size?: number | null; lastModified?: string | null; etag?: string | null };
type TreeNode = { id: string; name: string; kind: 'folder' | 'file'; children: TreeNode[]; item?: StorageObject; size: number; fileCount: number };

function formatBytes(value: number): string {
  if (!value) return '0 octet';
  if (value < 1024) return `${value} octets`;
  if (value < 1024 ** 2) return `${(value / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${(value / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
}

function buildTree(items: StorageObject[]): TreeNode {
  const root: TreeNode = { id: '', name: 'pelagic-data', kind: 'folder', children: [], size: 0, fileCount: 0 };
  items.forEach((item) => {
    const parts = item.key.split('/').filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const id = parts.slice(0, index + 1).join('/');
      let child = cursor.children.find((node) => node.name === part && node.kind === (isFile ? 'file' : 'folder'));
      if (!child) {
        child = { id, name: part, kind: isFile ? 'file' : 'folder', children: [], item: isFile ? item : undefined, size: isFile ? Number(item.size || 0) : 0, fileCount: isFile ? 1 : 0 };
        cursor.children.push(child);
      }
      cursor = child;
    });
  });

  function summarize(node: TreeNode): TreeNode {
    node.children = node.children.map(summarize).sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, 'fr', { numeric: true }) : a.kind === 'folder' ? -1 : 1);
    if (node.kind === 'folder') {
      node.size = node.children.reduce((sum, child) => sum + child.size, 0);
      node.fileCount = node.children.reduce((sum, child) => sum + child.fileCount, 0);
    }
    return node;
  }
  return summarize(root);
}

function collectFolderIds(node: TreeNode): string[] {
  return [node.kind === 'folder' ? node.id : '', ...node.children.flatMap(collectFolderIds)].filter(Boolean);
}

function fileIcon(name: string) {
  if (name.endsWith('.csv')) return <FileSpreadsheet size={16} />;
  if (name.endsWith('.json')) return <FileJson size={16} />;
  return <FileText size={16} />;
}

function TreeRow({ node, depth, expanded, selectedId, onToggle, onSelect }: {
  node: TreeNode; depth: number; expanded: Set<string>; selectedId: string;
  onToggle: (id: string) => void; onSelect: (node: TreeNode) => void;
}) {
  const isOpen = node.kind === 'folder' && expanded.has(node.id);
  return <>
    <button type="button" role="treeitem" aria-expanded={node.kind === 'folder' ? isOpen : undefined}
      className={`storage-tree-row ${selectedId === node.id ? 'selected' : ''}`}
      style={{ paddingLeft: `${10 + depth * 20}px` }}
      onClick={() => { onSelect(node); if (node.kind === 'folder') onToggle(node.id); }} title={node.id}>
      <span className="storage-tree-chevron">{node.kind === 'folder' ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</span>
      <span className={`storage-tree-icon ${node.kind}`}>{node.kind === 'folder' ? (isOpen ? <FolderOpen size={17} /> : <Folder size={17} />) : fileIcon(node.name)}</span>
      <span className="storage-tree-name">{node.name}</span>
      <span className="storage-tree-meta">{node.kind === 'folder' ? node.fileCount : formatBytes(node.size)}</span>
    </button>
    {isOpen && node.children.map((child) => <TreeRow key={`${child.kind}-${child.id}`} node={child} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} />)}
  </>;
}

export default function FilesPage() {
  const [items, setItems] = useState<StorageObject[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [preview, setPreview] = useState<{ content: string; truncated: boolean; previewBytes: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.storageObjects('');
      const loadedItems = res.data.items as StorageObject[];
      setItems(loadedItems);
      setExpanded(new Set(collectFolderIds(buildTree(loadedItems))));
    }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr');
    return normalized ? items.filter((item) => item.key.toLocaleLowerCase('fr').includes(normalized)) : items;
  }, [items, query]);
  const tree = useMemo(() => buildTree(filteredItems), [filteredItems]);
  const folderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + Number(item.size || 0), 0), [items]);

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
      setSelected(null); await showSuccess('Fichier supprimé'); load();
    } catch (err: any) { await showError('Suppression échouée', err.response?.data?.error); }
  }

  return <div className="files-page">
    <PageHeader title="Explorateur de données" subtitle="Arborescence du bucket MinIO Pelagic"
      actions={<button type="button" className="btn" onClick={load}><RefreshCw size={16} /> Actualiser</button>} />

    <div className="storage-summary-bar">
      <span><HardDrive size={16} /><strong>pelagic-data</strong></span>
      <span>{items.length.toLocaleString('fr-FR')} fichiers</span><span>{formatBytes(totalSize)} stockés</span>
    </div>

    <section className="storage-explorer">
      <div className="storage-explorer-toolbar">
        <label className="storage-search"><Search size={15} /><input placeholder="Rechercher un dossier ou un fichier" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="actions"><button type="button" className="btn sm" onClick={() => setExpanded(new Set(folderIds))}>Tout développer</button><button type="button" className="btn sm" onClick={() => setExpanded(new Set())}>Tout réduire</button></div>
      </div>

      {loading ? <LoadingOverlay message="Chargement des fichiers" /> : <>
      <div className="storage-explorer-body">
        <div className="storage-tree" role="tree" aria-label="Arborescence du stockage">
          <div className="storage-tree-header"><span>Nom</span><span>Fichiers / taille</span></div>
          {tree.children.length ? tree.children.map((node) => <TreeRow key={`${node.kind}-${node.id}`} node={node} depth={0} expanded={expanded} selectedId={selected?.id || ''} onToggle={toggleFolder} onSelect={setSelected} />) : <div className="storage-empty">Aucun fichier ne correspond à la recherche.</div>}
        </div>

        <aside className="storage-details">
          {selected ? <>
            <div className={`storage-detail-icon ${selected.kind}`}>{selected.kind === 'folder' ? <FolderOpen size={28} /> : fileIcon(selected.name)}</div>
            <h2>{selected.name}</h2><p className="storage-detail-path">{selected.id}</p>
            <dl>
              <div><dt>Type</dt><dd>{selected.kind === 'folder' ? 'Dossier logique' : selected.name.split('.').pop()?.toUpperCase() || 'Fichier'}</dd></div>
              <div><dt>Taille</dt><dd>{formatBytes(selected.size)}</dd></div>
              {selected.kind === 'folder' && <div><dt>Contenu</dt><dd>{selected.fileCount} fichier(s)</dd></div>}
              {selected.item?.lastModified && <div><dt>Modifié</dt><dd>{new Date(selected.item.lastModified).toLocaleString('fr-FR')}</dd></div>}
            </dl>
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
