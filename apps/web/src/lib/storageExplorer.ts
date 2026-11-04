export type ImportError = { id: string; message: string; at: string | null };
export type StorageObject = {
  key: string; size?: number | null; lastModified?: string | null; etag?: string | null;
  exportType: 'trips' | 'points'; rowCount: number | null; dateFrom: string | null; dateTo: string | null;
  importedAt: string | null; status: string; metadataSource: string; manifestKey: string | null;
  unmatchedBoatCount: number | null; errors: ImportError[];
  rowCountVerifiedAt?: string | null;
};
export type TreeNode = {
  id: string; name: string; kind: 'folder' | 'file'; children: TreeNode[]; item?: StorageObject;
  size: number; fileCount: number; trips: number; points: number; tripsFiles: number; pointsFiles: number;
  unknownTrips: number; unknownPoints: number; dateFrom: string | null; dateTo: string | null;
  errors: ImportError[]; status: string;
};

function emptyNode(id: string, name: string, kind: TreeNode['kind']): TreeNode {
  return { id, name, kind, children: [], size: 0, fileCount: 0, trips: 0, points: 0, tripsFiles: 0,
    pointsFiles: 0, unknownTrips: 0, unknownPoints: 0, dateFrom: null, dateTo: null, errors: [], status: 'UNKNOWN' };
}

export function buildTree(items: StorageObject[]): TreeNode {
  const root = emptyNode('', 'pelagic-data', 'folder');
  for (const item of items) {
    if (!/^(trips|points)\/.+\.csv$/i.test(item.key)) continue;
    const parts = item.key.split('/').filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const kind = index === parts.length - 1 ? 'file' : 'folder';
      const id = parts.slice(0, index + 1).join('/');
      let child = cursor.children.find(node => node.id === id);
      if (!child) { child = emptyNode(id, part, kind); cursor.children.push(child); }
      if (kind === 'file') {
        child.item = item;
        child.size = Number(item.size || 0);
        child.fileCount = 1;
        child.tripsFiles = item.exportType === 'trips' ? 1 : 0;
        child.pointsFiles = item.exportType === 'points' ? 1 : 0;
        child.trips = child.tripsFiles ? item.rowCount ?? 0 : 0;
        child.points = child.pointsFiles ? item.rowCount ?? 0 : 0;
        child.unknownTrips = child.tripsFiles && item.rowCount == null ? 1 : 0;
        child.unknownPoints = child.pointsFiles && item.rowCount == null ? 1 : 0;
        child.dateFrom = item.dateFrom;
        child.dateTo = item.dateTo;
        child.status = item.status;
        child.errors = item.errors;
      }
      cursor = child;
    });
  }
  function summarize(node: TreeNode): TreeNode {
    node.children = node.children.map(summarize).sort((a, b) => a.kind === b.kind
      ? a.name.localeCompare(b.name, 'fr', { numeric: true }) : a.kind === 'folder' ? -1 : 1);
    if (node.kind === 'folder') {
      for (const key of ['size', 'fileCount', 'trips', 'points', 'tripsFiles', 'pointsFiles', 'unknownTrips', 'unknownPoints'] as const)
        node[key] = node.children.reduce((sum, child) => sum + child[key], 0);
      node.dateFrom = node.children.map(c => c.dateFrom).filter((v): v is string => !!v).sort()[0] || null;
      node.dateTo = node.children.map(c => c.dateTo).filter((v): v is string => !!v).sort().at(-1) || null;
      node.errors = [...new Map(node.children.flatMap(c => c.errors).map(error => [error.id, error])).values()];
      node.status = node.children.every(c => c.status === 'SUCCESS') ? 'SUCCESS'
        : node.children.some(c => c.status === 'FAILED') ? 'FAILED' : 'UNKNOWN';
    }
    return node;
  }
  return summarize(root);
}

export function collectFolderIds(node: TreeNode): string[] {
  return [node.kind === 'folder' ? node.id : '', ...node.children.flatMap(collectFolderIds)].filter(Boolean);
}

export function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children) { const match = findNode(child, id); if (match) return match; }
  return null;
}

export function rowCountLabel(node: TreeNode, type: 'trips' | 'points'): string {
  const files = type === 'trips' ? node.tripsFiles : node.pointsFiles;
  const unknown = type === 'trips' ? node.unknownTrips : node.unknownPoints;
  if (!files) return '—';
  if (unknown === files) return 'Inconnu';
  return `${unknown ? '≥ ' : ''}${node[type].toLocaleString('fr-FR')}`;
}
