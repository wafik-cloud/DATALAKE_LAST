import { Request, Response, NextFunction } from 'express';

export function rateLimit(maxPerMinute = 10) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    if (buckets.size > 1000) for (const [ip, entry] of buckets) if (entry.resetAt < now) buckets.delete(ip);
    const entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }

    if (entry.count >= maxPerMinute) {
      res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute' });
      return;
    }

    entry.count += 1;
    next();
  };
}
