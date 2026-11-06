import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validPassword, requiredPermissions } from './authSecurity';
describe('password security and authorization policy', () => {
  it('salts passwords and rejects incorrect or malformed credentials', async () => {
    const a = await hashPassword('long-password-example');
    expect(a).not.toBe(await hashPassword('long-password-example'));
    expect(await verifyPassword('long-password-example', a)).toBe(true);
    expect(await verifyPassword('incorrect', a)).toBe(false);
    expect(await verifyPassword(undefined as any, a)).toBe(false);
    expect(await verifyPassword('test', 'malformed')).toBe(false);
    expect(validPassword('short')).toBe(false);
    expect(validPassword('x'.repeat(129))).toBe(false);
  });
  it('separates screen access from destructive and operational capabilities', () => {
    expect(requiredPermissions('/storage/objects', 'DELETE')).toEqual(['files', 'files.delete']);
    expect(requiredPermissions('/storage/objects/download', 'GET')).toEqual(['files', 'files.download']);
    expect(requiredPermissions('/pelagic/schedules/id/run', 'POST')).toEqual(['planning', 'imports.run']);
    expect(requiredPermissions('/pelagic/schedules/id', 'PUT')).toEqual(['planning', 'planning.manage']);
    expect(requiredPermissions('/pelagic/jobs/id/retry', 'POST')).toEqual(['jobs', 'imports.run']);
    expect(requiredPermissions('/unknown', 'GET')).toEqual(['__denied__']);
  });
});
