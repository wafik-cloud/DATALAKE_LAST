import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Protection temporaire phase 2–3 : clé admin via header.
 * Sera remplacée par JWT / Keycloak en phase sécurité.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const headerKey = req.header('X-Admin-Key');
  const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '');

  if (headerKey === env.adminApiKey || bearer === env.adminApiKey) {
    next();
    return;
  }

  res.status(401).json({ error: 'Accès administrateur requis' });
}
