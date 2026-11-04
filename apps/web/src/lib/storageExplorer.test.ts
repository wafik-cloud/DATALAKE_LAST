import { describe, expect, it } from 'vitest';
import { buildTree, findNode, rowCountLabel, type StorageObject } from './storageExplorer';

const file = (key: string, rows: number | null): StorageObject => ({ key, size: 100,
  exportType: key.startsWith('trips/') ? 'trips' : 'points', rowCount: rows,
  dateFrom: '2026-04-01 01:00:00', dateTo: '2026-04-02 01:00:00', importedAt: null,
  status: 'SUCCESS', metadataSource: 'manifest', manifestKey: 'manifests/one.json', unmatchedBoatCount: null, errors: [] });

describe('explorer monthly summaries', () => {
  it('only exposes data CSVs and totals each month and year by data type', () => {
    const tree = buildTree([file('trips/2026/04/a.csv', 48), file('trips/2026/04/b.csv', 63),
      file('trips/2026/05/c.csv', 5), file('points/2026/04/a.csv', 214899),
      file('manifests/2026/04/a.json', 999), file('previews/maps/points/a.json', 999), file('errors/a.json', 999)]);
    expect(tree.children.map(n => n.name)).toEqual(['points', 'trips']);
    expect(findNode(tree, 'trips/2026/04')?.trips).toBe(111);
    expect(findNode(tree, 'trips/2026')?.trips).toBe(116);
    expect(findNode(tree, 'points/2026/04')?.points).toBe(214899);
    expect(tree.fileCount).toBe(4);
  });

  it('distinguishes zero rows from missing metadata without understating a partial total', () => {
    const tree = buildTree([file('trips/2026/04/empty.csv', 0), file('trips/2026/04/unknown.csv', null)]);
    expect(rowCountLabel(findNode(tree, 'trips/2026/04/empty.csv')!, 'trips')).toBe('0');
    expect(rowCountLabel(findNode(tree, 'trips/2026/04/unknown.csv')!, 'trips')).toBe('Inconnu');
    expect(rowCountLabel(findNode(tree, 'trips/2026/04')!, 'trips')).toBe('≥ 0');
    expect(rowCountLabel(tree, 'points')).toBe('—');
  });

  it('counts an earlier failed attempt once per folder, keeping recovered files successful', () => {
    const a = file('points/2026/04/a.csv', 10);
    a.errors = [{ id: 'failed-job', message: 'Timeout', at: null }];
    const b = { ...a, key: 'points/2026/04/b.csv' };
    const month = findNode(buildTree([a, b]), 'points/2026/04')!;
    expect(month.errors).toHaveLength(1);
    expect(month.status).toBe('SUCCESS');
  });
});
