import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex || typeof password !== 'string' || password.length > 128) return false;
  const hash = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}
export const permissions = [
  ['dashboard', 'Tableau de bord'], ['planning', 'Planification'], ['sync', 'Import manuel'],
  ['jobs', 'Historique'], ['files', 'Fichiers'], ['quality', 'Contrôle qualité'],
  ['minio', 'Configuration MinIO'], ['pelagic', 'Configuration Pelagic'], ['maintenance', 'Maintenance'],
  ['imports.run', 'Lancer, relancer et annuler les imports'], ['planning.manage', 'Modifier les planifications'],
  ['files.download', 'Télécharger les fichiers'], ['files.delete', 'Supprimer les fichiers'],
  ['settings.manage', 'Modifier les configurations'],
] as const;
export function requiredPermissions(path: string, method: string): string[] {
  if (path.startsWith('/dashboard')) return ['dashboard'];
  if (path.startsWith('/maintenance')) return ['maintenance'];
  if (path.startsWith('/storage')) {
    if (path === '/storage/status' || path === '/storage/test') return method === 'GET' ? ['minio'] : ['minio', 'settings.manage'];
    if (method === 'DELETE') return ['files', 'files.delete'];
    if (path.endsWith('/download')) return ['files', 'files.download'];
    return ['files'];
  }
  if (path.startsWith('/pelagic')) {
    const p = path.slice('/pelagic'.length);
    if (p.startsWith('/jobs')) return method === 'GET' ? ['jobs'] : ['jobs', 'imports.run'];
    if (p.startsWith('/settings') || p === '/test') return method === 'GET' ? ['pelagic'] : ['pelagic', 'settings.manage'];
    if (p.startsWith('/sync')) return ['sync', 'imports.run'];
    if (p.startsWith('/months') || p.startsWith('/schedule')) {
      if (method === 'GET') return ['planning'];
      return ['planning', p.endsWith('/sync') || p.endsWith('/run') ? 'imports.run' : 'planning.manage'];
    }
  }
  return ['__denied__'];
}
