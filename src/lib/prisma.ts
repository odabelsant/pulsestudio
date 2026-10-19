import path from 'node:path';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const databaseUrl =
  process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'dev.db')}`;

declare global {
  var prisma: PrismaClient | undefined;
}

const cachedPrisma = globalThis.prisma;
const cachedClientHasHistoryModels =
  typeof cachedPrisma?.chatSession?.create === 'function' &&
  typeof cachedPrisma.chatMessage?.create === 'function';

export const prisma = cachedClientHasHistoryModels
  ? cachedPrisma
  : new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
