import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { digest, requiredPermissions } from '../services/authSecurity';
export const cookieName = 'pds_session';
export function sessionToken(req: Request) {
  return req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
}
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const raw = sessionToken(req);
  const session = raw ? await prisma.userSession.findUnique({ where: { tokenHash: digest(raw) }, include: { user: true } }) : null;
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active || session.lastSeenAt.getTime() < Date.now() - 30 * 60_000) {
    res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' }); return;
  }
  res.locals.user = session.user;
  res.locals.session = session;
  // Never trust the caller-supplied actor header used by legacy domain audit logs.
  req.headers['x-user'] = session.user.login;
  if (!(req.baseUrl === '/api/auth' && req.path === '/me')) await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  next();
}
export function recordActivity(req: Request, res: Response, next: NextFunction) {
  const user = res.locals.user;
  const session = res.locals.session;
  if (req.baseUrl === '/api/auth' && ['/me', '/activity'].includes(req.path)) { next(); return; }
  const resource = req.baseUrl + req.path;
  const details: Record<string, unknown> = {};
  for (const key of ['login', 'email', 'name', 'active', 'isAdmin', 'permissions', 'dateFrom', 'dateTo', 'exportTypes', 'intervalDays', 'enabled', 'time', 'timezone']) {
    if (req.body?.[key] !== undefined) details[key] = req.body[key];
  }
  if (typeof req.query.key === 'string') details.file = req.query.key.slice(0, 1024);
  // Record only selected business fields; never passwords, credentials or reset tokens.
  res.on('finish', () => {
    void prisma.userActivity.create({ data: {
      userId: user?.id, actor: user?.login || 'anonymous', sessionId: session?.id,
      action: req.method, resource, details: Object.keys(details).length ? JSON.stringify(details).slice(0, 4000) : undefined, status: res.statusCode, ip: req.ip || '',
    } }).catch(() => console.error('[audit] Échec enregistrement activité'));
  });
  next();
}
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.user;
  if (!user) { res.status(401).json({ error: 'Connexion requise' }); return; }
  const needed = requiredPermissions(req.baseUrl.replace('/api/admin', '') + req.path, req.method);
  const sharedRead = req.method === 'GET' && ((req.baseUrl.endsWith('/pelagic') && req.path === '/settings' && user.permissions.includes('sync')) || (req.baseUrl.endsWith('/pelagic') && req.path === '/jobs' && user.permissions.includes('planning')));
  if (user.isAdmin || sharedRead || needed.every(p => user.permissions.includes(p))) { next(); return; }
  res.status(403).json({ error: 'Vous ne disposez pas des droits nécessaires pour cette action.' });
}
export function administratorsOnly(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user?.isAdmin) { res.status(403).json({ error: 'Administration des accès réservée aux administrateurs.' }); return; }
  next();
}
