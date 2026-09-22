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

function createPrismaClient() {
  const connectionString = getConnectionString();
  const needsSsl =
    connectionString.includes('supabase.co') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production';

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
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

