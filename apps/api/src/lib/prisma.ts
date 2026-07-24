import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function connectDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL absent — suivi des jobs désactivé');
    return;
  }
  await prisma.$connect();
  console.log('[db] PostgreSQL connecté');
}
