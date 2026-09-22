import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function getConnectionString(): string {
  const connectionString =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      'Missing Supabase/Postgres connection string. Set POSTGRES_PRISMA_URL or DATABASE_URL in Vercel/local environment.'
    );
  }

  return connectionString;
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

function createPrismaClient() {
  const rawConnectionString = getConnectionString();
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;

