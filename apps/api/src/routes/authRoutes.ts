import { Router } from 'express';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authenticate, recordActivity, cookieName } from '../middleware/requireAdmin';
import { rateLimit } from '../middleware/rateLimit';
import { digest, token, hashPassword, verifyPassword, validPassword } from '../services/authSecurity';
export const authRoutes = Router();
export const publicUser = (u: any) => ({ id: u.id, login: u.login, email: u.email, name: u.name, isAdmin: u.isAdmin, active: u.active, permissions: u.permissions, mustChangePassword: u.mustChangePassword });
export function validIdentity(b: any) {
  return typeof b.login === 'string' && /^[a-zA-Z0-9._-]{3,60}$/.test(b.login) && typeof b.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) && b.email.length <= 254 && typeof b.name === 'string' && b.name.trim().length > 0 && b.name.length <= 100;
}
export const mailReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.APP_PUBLIC_URL);
export async function sendReset(user: { id: string; email: string }) {
  if (!mailReady()) throw new Error('SMTP non configuré');
  const raw = token();
  const reset = await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: digest(raw), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
      requireTLS: port !== 465, connectionTimeout: 10_000, socketTimeout: 15_000,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
    const url = new URL('/login', process.env.APP_PUBLIC_URL);
    url.hash = `reset=${raw}`;
    await transport.sendMail({ from: process.env.SMTP_FROM, to: user.email, subject: 'PDS — Réinitialisation de votre mot de passe',
      text: `Pour choisir un nouveau mot de passe, ouvrez ce lien : ${url.toString()}\nCe lien personnel expire dans 30 minutes et ne peut être utilisé qu’une fois. Si vous n’avez rien demandé, ignorez ce message.` });
  } catch (e) {
    await prisma.passwordReset.delete({ where: { id: reset.id } }); throw e;
  }
}
authRoutes.get('/status', async (_req, res) => res.json({ setupRequired: await prisma.platformUser.count() === 0 }));
authRoutes.post('/setup', rateLimit(5), async (req, res) => {
  if (await prisma.platformUser.count() !== 0 || req.header('X-Admin-Key') !== env.adminApiKey) { res.status(403).json({ error: 'Initialisation non autorisée' }); return; }
  const b = req.body;
  if (!validIdentity(b) || !validPassword(b.password)) { res.status(400).json({ error: 'Identité invalide ou mot de passe inférieur à 12 caractères.' }); return; }
  const passwordHash = await hashPassword(b.password);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741925)`;
    if (await tx.platformUser.count()) throw new Error('Initialisation déjà effectuée');
    await tx.platformUser.create({ data: { login: b.login.toLowerCase(), email: b.email.toLowerCase(), name: b.name.trim(), passwordHash, isAdmin: true } });
  });
  res.status(201).json({ ok: true });
});
const dummyHash = hashPassword(token());
authRoutes.post('/login', rateLimit(10), async (req, res) => {
  const login = typeof req.body.login === 'string' ? req.body.login.toLowerCase().trim() : '';
  const user = await prisma.platformUser.findUnique({ where: { login } });
  const valid = await verifyPassword(req.body.password, user?.passwordHash || await dummyHash);
  if (!user || !user.active || !valid) {
    await prisma.userActivity.create({ data: { actor: login.slice(0, 60), action: 'LOGIN_FAILED', resource: '/auth/login', status: 401, ip: req.ip || '' } });
    res.status(401).json({ error: 'Identifiants invalides.' }); return;
  }
  const raw = token();
  const session = await prisma.userSession.create({ data: { tokenHash: digest(raw), userId: user.id, ip: req.ip || '', userAgent: (req.header('User-Agent') || '').slice(0, 500), expiresAt: new Date(Date.now() + 12 * 3600_000) } });
  res.cookie(cookieName, raw, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/api', maxAge: 12 * 3600_000 });
  await prisma.userActivity.create({ data: { userId: user.id, actor: user.login, sessionId: session.id, action: 'LOGIN', resource: '/auth/login', status: 200, ip: req.ip || '' } });
  res.json(publicUser(user));
});
authRoutes.post('/forgot-password', rateLimit(5), async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = await prisma.platformUser.findUnique({ where: { email } });
  if (user?.active) { try { await sendReset(user); } catch { console.error('[mail] Envoi de récupération impossible'); } }
  res.json({ message: 'Si cette adresse correspond à un compte actif, un lien de réinitialisation vous sera envoyé.' });
});
authRoutes.post('/reset-password', rateLimit(5), async (req, res) => {
  if (!validPassword(req.body.password) || typeof req.body.token !== 'string') { res.status(400).json({ error: 'Le mot de passe doit contenir de 12 à 128 caractères.' }); return; }
  const passwordHash = await hashPassword(req.body.password);
  const ok = await prisma.$transaction(async tx => {
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash: digest(req.body.token) }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) return false;
    const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!claimed.count) return false;
    await tx.platformUser.update({ where: { id: reset.userId }, data: { passwordHash, mustChangePassword: false } });
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.userSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.userActivity.create({ data: { userId: reset.userId, actor: reset.user.login, action: 'PASSWORD_RESET', resource: '/auth/reset-password', status: 200, ip: req.ip || '' } });
    return true;
  });
  res.status(ok ? 200 : 400).json(ok ? { ok: true } : { error: 'Lien invalide ou expiré.' });
});
authRoutes.use(authenticate, recordActivity);
authRoutes.post('/activity', async (req, res) => {
  const pages = ['/admin', '/admin/planning', '/admin/jobs', '/admin/files', '/admin/quality-control', '/admin/sync', '/admin/minio', '/admin/pelagic', '/admin/maintenance', '/admin/access', '/admin/account'];
  if (!pages.includes(req.body.page)) { res.status(400).json({ error: 'Écran inconnu' }); return; }
  await prisma.userActivity.create({ data: { userId: res.locals.user.id, actor: res.locals.user.login, sessionId: res.locals.session.id, action: 'SCREEN_VIEW', resource: req.body.page, status: 200, ip: req.ip || '' } });
  res.json({ ok: true });
});
authRoutes.get('/me', (_req, res) => res.json(publicUser(res.locals.user)));
authRoutes.post('/logout', async (_req, res) => {
  await prisma.userSession.update({ where: { id: res.locals.session.id }, data: { revokedAt: new Date() } });
  res.clearCookie(cookieName, { path: '/api' }); res.json({ ok: true });
});
authRoutes.post('/password', rateLimit(5), async (req, res) => {
  if (!validPassword(req.body.password) || req.body.password === req.body.currentPassword || !await verifyPassword(req.body.currentPassword, res.locals.user.passwordHash)) { res.status(400).json({ error: 'Mot de passe actuel incorrect. Choisissez un nouveau mot de passe différent, de 12 caractères minimum.' }); return; }
  await prisma.$transaction([
    prisma.platformUser.update({ where: { id: res.locals.user.id }, data: { passwordHash: await hashPassword(req.body.password), mustChangePassword: false } }),
    prisma.userSession.updateMany({ where: { userId: res.locals.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.passwordReset.updateMany({ where: { userId: res.locals.user.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  res.clearCookie(cookieName, { path: '/api' }); res.json({ ok: true });
});
authRoutes.get('/sessions', async (_req, res) => res.json(await prisma.userSession.findMany({ where: { userId: res.locals.user.id }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' }, take: 100 })));
authRoutes.delete('/sessions/:id', async (req, res) => {
  await prisma.userSession.updateMany({ where: { id: String(req.params.id), userId: res.locals.user.id }, data: { revokedAt: new Date() } }); res.json({ ok: true });
});
