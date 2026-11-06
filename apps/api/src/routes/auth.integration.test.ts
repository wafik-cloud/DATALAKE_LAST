// Run against an isolated database only: AUTH_TEST_DATABASE_URL=... DATABASE_URL=... npm test
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
const mail = vi.hoisted(() => ({ text: '' }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: async (m: any) => { mail.text = m.text; } }) } }));
import { app } from '../index';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { digest } from '../services/authSecurity';
const isolated = Boolean(process.env.AUTH_TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.AUTH_TEST_DATABASE_URL);
describe.skipIf(!isolated)('authentication and access integration (isolated PostgreSQL)', () => {
  let server: Server; let base: string; let adminCookie = ''; let userCookie = ''; let userId = '';
  const password = 'Temporary-secret-12345';
  async function request(path: string, method = 'GET', body?: unknown, cookie = '', headers = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  beforeAll(async () => {
    server = app.listen(0); await new Promise<void>(r => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); });
  it('requires authentication, restricts initialization, then closes legacy access', async () => {
    expect((await request('/api/admin/access')).status).toBe(401);
    const body = { login: 'admin', name: 'Admin', email: 'admin@example.test', password };
    expect((await request('/api/auth/setup', 'POST', body)).status).toBe(403);
    expect((await request('/api/auth/setup', 'POST', body, '', { 'X-Admin-Key': env.adminApiKey })).status).toBe(201);
    expect((await request('/api/auth/setup', 'POST', body, '', { 'X-Admin-Key': env.adminApiKey })).status).toBe(403);
    expect((await request('/api/admin/access', 'GET', undefined, '', { 'X-Admin-Key': env.adminApiKey })).status).toBe(401);
    expect((await request('/api/auth/login', 'POST', { login: 'admin', password: 'wrong' })).status).toBe(401);
    const login = await request('/api/auth/login', 'POST', { login: 'admin', password });
    expect(login.status).toBe(200); expect(login.body.passwordHash).toBeUndefined(); adminCookie = login.cookie;
    expect((await request('/api/admin/access', 'GET', undefined, adminCookie)).status).toBe(403);
    expect((await request('/api/auth/password', 'POST', { currentPassword: password, password: 'Personal-password-12345' }, adminCookie)).status).toBe(200);
    expect((await request('/api/auth/me', 'GET', undefined, adminCookie)).status).toBe(401);
    adminCookie = (await request('/api/auth/login', 'POST', { login: 'admin', password: 'Personal-password-12345' })).cookie;
  });
  it('enforces privileges, prevents actor spoofing and preserves the last admin', async () => {
    const access = await request('/api/admin/access', 'GET', undefined, adminCookie);
    expect(access.status).toBe(200);
    const admin = access.body.users[0];
    expect((await request('/api/admin/access/users/' + admin.id, 'PUT', { ...admin, isAdmin: false }, adminCookie)).status).toBe(409);
    const created = await request('/api/admin/access/users', 'POST', { login: 'reader', email: 'reader@example.test', name: 'Reader', password, isAdmin: false, active: true, permissions: ['jobs', 'files'] }, adminCookie);
    expect(created.status).toBe(201); userId = created.body.id;
    userCookie = (await request('/api/auth/login', 'POST', { login: 'reader', password })).cookie;
    await request('/api/auth/password', 'POST', { currentPassword: password, password: 'Reader-password-12345' }, userCookie);
    userCookie = (await request('/api/auth/login', 'POST', { login: 'reader', password: 'Reader-password-12345' })).cookie;
    expect((await request('/api/admin/pelagic/jobs', 'GET', undefined, userCookie)).status).toBe(200);
    expect((await request('/api/admin/access', 'GET', undefined, userCookie)).status).toBe(403);
    expect((await request('/api/admin/storage/objects', 'DELETE', undefined, userCookie, { 'X-User': 'admin' })).status).toBe(403);
    expect((await request('/api/admin/storage/objects/download', 'GET', undefined, userCookie)).status).toBe(403);
    expect((await request('/api/admin/pelagic/jobs/id/retry', 'POST', {}, userCookie)).status).toBe(403);
    expect((await request('/api/auth/logout', 'POST', {}, userCookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    await new Promise(r => setTimeout(r, 50));
    const log = await prisma.userActivity.findFirst({ where: { resource: '/api/admin/storage/objects', action: 'DELETE' } });
    expect(log?.actor).toBe('reader'); expect(log?.status).toBe(403);
  });
  it('expires idle sessions, revokes changed accounts and consumes email reset links once', async () => {
    const session = await prisma.userSession.findUniqueOrThrow({ where: { tokenHash: digest(userCookie.split('=')[1]) } });
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await request('/api/auth/me', 'GET', undefined, userCookie)).status).toBe(401);
    userCookie = (await request('/api/auth/login', 'POST', { login: 'reader', password: 'Reader-password-12345' })).cookie;
    const user = await prisma.platformUser.findUniqueOrThrow({ where: { id: userId } });
    expect((await request('/api/admin/access/users/' + userId, 'PUT', { ...user, permissions: [] }, adminCookie)).status).toBe(200);
    expect((await request('/api/auth/me', 'GET', undefined, userCookie)).status).toBe(401);
    process.env.SMTP_HOST = 'smtp.example.test'; process.env.SMTP_FROM = 'pds@example.test'; process.env.APP_PUBLIC_URL = 'https://pds.example.test';
    const generic = await request('/api/auth/forgot-password', 'POST', { email: user.email });
    expect(generic.status).toBe(200);
    expect((await request('/api/auth/forgot-password', 'POST', { email: 'absent@example.test' })).body).toEqual(generic.body);
    const raw = mail.text.match(/reset=([a-f0-9]{64})/)![1];
    expect((await prisma.passwordReset.findUnique({ where: { tokenHash: digest(raw) } }))?.tokenHash).not.toBe(raw);
    expect((await request('/api/auth/reset-password', 'POST', { token: raw, password: 'Reset-password-12345' })).status).toBe(200);
    expect((await request('/api/auth/reset-password', 'POST', { token: raw, password: 'Reset-password-12345' })).status).toBe(400);
    const login = await request('/api/auth/login', 'POST', { login: 'reader', password: 'Reset-password-12345' });
    expect(login.status).toBe(200);
    await request('/api/auth/logout', 'POST', {}, login.cookie);
    expect((await request('/api/auth/me', 'GET', undefined, login.cookie)).status).toBe(401);
  });
});
