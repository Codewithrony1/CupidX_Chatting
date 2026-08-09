import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getDatabasePath = () => {
  const defaultPath = path.join(process.cwd(), 'prisma', 'dev.db');
  
  // On Vercel / AWS Lambda Serverless platform, /var/task is read-only.
  // os.tmpdir() returns /tmp in serverless execution environments.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpPath = path.join(os.tmpdir(), 'dev.db');
    try {
      if (!fs.existsSync(tmpPath)) {
        if (fs.existsSync(defaultPath)) {
          fs.copyFileSync(defaultPath, tmpPath);
        } else {
          fs.writeFileSync(tmpPath, '');
        }
      }
      return tmpPath;
    } catch (e) {
      console.warn('Failed to copy SQLite database to temp dir, falling back to default path:', e);
    }
  }
  return defaultPath;
};

const createPrismaClient = () => {
  const dbPath = getDatabasePath();
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
