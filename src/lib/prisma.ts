import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: any | undefined;
};

function getRawConnectionString(): string {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    'file:./prisma/dev.db'
  );
}

function getIsPostgres(): boolean {
  try {
    const path = require('path');
    const fs = require('fs');
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf8');
      if (/provider\s*=\s*"sqlite"/i.test(content)) return false;
      if (/provider\s*=\s*"postgresql"/i.test(content)) return true;
    }
  } catch {}

  const rawUrl = getRawConnectionString();
  return rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://');
}

function cleanConnectionString(raw: string): string {
  let url = raw;
  if (/sslmode=/i.test(url)) {
    url = url.replace(/sslmode=[^&]+/i, 'sslmode=no-verify');
  } else {
    url += (url.includes('?') ? '&' : '?') + 'sslmode=no-verify';
  }
  return url;
}

function createPrismaClient(): PrismaClient {
  const isPostgres = getIsPostgres();

  if (isPostgres) {
    const { PrismaPg } = require('@prisma/adapter-pg');
    const { Pool } = require('pg');

    let rawConnectionString = getRawConnectionString();
    if (!rawConnectionString.startsWith('postgresql://') && !rawConnectionString.startsWith('postgres://')) {
      // Build-time fallback if building against postgres schema without live DB
      rawConnectionString = 'postgresql://dummy:dummy@localhost:5432/dummy';
    }

    const needsSsl =
      rawConnectionString.includes('supabase.co') ||
      rawConnectionString.includes('pooler.supabase.com') ||
      rawConnectionString.includes('sslmode=require') ||
      process.env.NODE_ENV === 'production';

    if (needsSsl && typeof process !== 'undefined') {
      // 1. Prevent Node TLS rejection of Supabase pooler intermediate/self-signed certs in serverless
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      // 2. Set PGSSLMODE to no-verify so pg connection-parameters defaults rejectUnauthorized to false
      process.env.PGSSLMODE = 'no-verify';
    }

    const connectionString = needsSsl ? cleanConnectionString(rawConnectionString) : rawConnectionString;

    const pool =
      globalForPrisma.pgPool ??
      new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.pgPool = pool;
    }

    const adapter = new PrismaPg(pool);

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  // SQLite adapter for local development (dev.db)
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  let dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
  if (!fs.existsSync(dbPath)) {
    const altPath = path.join(__dirname, '..', '..', 'prisma', 'dev.db');
    if (fs.existsSync(altPath)) {
      dbPath = altPath;
    }
  }

  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
