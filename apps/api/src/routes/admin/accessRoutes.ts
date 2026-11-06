import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { administratorsOnly } from '../../middleware/requireAdmin';
import { permissions, validPassword, hashPassword } from '../../services/authSecurity';
import { publicUser, validIdentity, mailReady, sendReset } from '../authRoutes';
const router = Router();
router.use(administratorsOnly);
router.get('/', async (_req, res) => {
  const [users, sessions, activity] = await Promise.all([
    prisma.platformUser.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.userSession.findMany({ include: { user: { select: { login: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.userActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
  ]);
  res.json({ users: users.map(publicUser), sessions: sessions.map(({ tokenHash, ...s }) => s), activity, permissions, mailReady: mailReady() });
});
function validAccess(b: any) {
  return typeof b.isAdmin === 'boolean' && typeof b.active === 'boolean' && Array.isArray(b.permissions) && b.permissions.every((p: string) => permissions.some(([key]) => key === p));
}
router.post('/users', async (req, res) => {
  const b = req.body;
  if (!validIdentity(b) || !validAccess(b) || !validPassword(b.password)) { res.status(400).json({ error: 'Vérifiez les champs et le mot de passe (12 caractères minimum).' }); return; }
  try {
    const user = await prisma.platformUser.create({ data: { login: b.login.toLowerCase(), email: b.email.toLowerCase(), name: b.name.trim(), passwordHash: await hashPassword(b.password), active: b.active, isAdmin: b.isAdmin, permissions: b.permissions } });
    res.status(201).json(publicUser(user));
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') res.status(409).json({ error: 'Ce login ou cet email est déjà utilisé.' }); else throw e; }
});
router.put('/users/:id', async (req, res) => {
  const b = req.body;
  if (!validIdentity(b) || !validAccess(b)) { res.status(400).json({ error: 'Informations utilisateur invalides.' }); return; }
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741925)`;
      const id = String(req.params.id);
      const current = await tx.platformUser.findUnique({ where: { id } });
      if (!current) return { error: 'Utilisateur introuvable.', status: 404 };
      if (current.isAdmin && current.active && (!b.active || !b.isAdmin) && await tx.platformUser.count({ where: { active: true, isAdmin: true } }) <= 1) return { error: 'Conservez au moins un administrateur actif.', status: 409 };
      const user = await tx.platformUser.update({ where: { id }, data: { login: b.login.toLowerCase(), email: b.email.toLowerCase(), name: b.name.trim(), active: b.active, isAdmin: b.isAdmin, permissions: b.permissions } });
      await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
      return { user: publicUser(user) };
    });
    if (result.error) res.status(result.status!).json({ error: result.error }); else res.json(result.user);
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') res.status(409).json({ error: 'Ce login ou cet email est déjà utilisé.' }); else throw e; }
});
router.post('/users/:id/reset', async (req, res) => {
  if (!mailReady()) { res.status(503).json({ error: 'Renseignez SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD et APP_PUBLIC_URL sur le serveur.' }); return; }
  const user = await prisma.platformUser.findUnique({ where: { id: String(req.params.id) } });
  if (!user?.active) { res.status(404).json({ error: 'Compte actif introuvable.' }); return; }
  try { await sendReset(user); res.json({ ok: true }); } catch { res.status(502).json({ error: 'Le serveur de messagerie n’a pas accepté l’envoi.' }); }
});
router.delete('/sessions/:id', async (req, res) => {
  await prisma.userSession.updateMany({ where: { id: String(req.params.id), revokedAt: null }, data: { revokedAt: new Date() } }); res.json({ ok: true });
});
export default router;
