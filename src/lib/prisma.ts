import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const ensureDatabaseSchema = (targetDbPath: string) => {
  if (!targetDbPath || !fs.existsSync(targetDbPath)) return;
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(targetDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');

    // Performance indexes
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
        CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
        CREATE INDEX IF NOT EXISTS "MatchmakingQueue_status_updatedAt_idx" ON "MatchmakingQueue"("status", "updatedAt");
        CREATE INDEX IF NOT EXISTS "MatchmakingQueue_userId_status_idx" ON "MatchmakingQueue"("userId", "status");
        CREATE INDEX IF NOT EXISTS "ChatSession_status_startedAt_idx" ON "ChatSession"("status", "startedAt");
        CREATE INDEX IF NOT EXISTS "ManualUpiPayment_status_idx" ON "ManualUpiPayment"("status");
        CREATE INDEX IF NOT EXISTS "VipRequest_status_idx" ON "VipRequest"("status");
      `);
    } catch {
      // ignore if tables not yet migrated
    }

    // 1. Inspect and ensure User table columns
    const userTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get();
    if (userTable) {
      const userCols = (db.pragma('table_info("User")') as Array<{ name: string }>).map((c) => c.name);
      if (!userCols.includes('profileCompleted')) {
        db.exec('ALTER TABLE "User" ADD COLUMN profileCompleted BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('profileLocked')) {
        db.exec('ALTER TABLE "User" ADD COLUMN profileLocked BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('genderDobLocked')) {
        db.exec('ALTER TABLE "User" ADD COLUMN genderDobLocked BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('clerkUserId')) {
        db.exec('ALTER TABLE "User" ADD COLUMN clerkUserId TEXT;');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_key" ON "User"("clerkUserId");');
      }

      // Preserve existing users: if DOB + Gender is valid, ensure marked completed
      db.exec(`
        UPDATE "User"
        SET profileCompleted = 1, profileLocked = 1
        WHERE dob IS NOT NULL
          AND gender IS NOT NULL
          AND gender != 'unspecified'
          AND profileCompleted = 0;
      `);
    }

    // 2. Inspect and ensure Profile table columns
    const profileTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Profile'").get();
    if (profileTable) {
      const profileCols = (db.pragma('table_info("Profile")') as Array<{ name: string }>).map((c) => c.name);
      if (!profileCols.includes('profileCompleted')) {
        db.exec('ALTER TABLE "Profile" ADD COLUMN profileCompleted BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!profileCols.includes('profileLocked')) {
        db.exec('ALTER TABLE "Profile" ADD COLUMN profileLocked BOOLEAN NOT NULL DEFAULT 0;');
      }

      db.exec(`
        UPDATE "Profile"
        SET profileCompleted = 1, profileLocked = 1
        WHERE dob IS NOT NULL
          AND gender IS NOT NULL
          AND gender != 'unspecified'
          AND profileCompleted = 0;
      `);
    }

    // 3. Inspect and ensure AppSetting table
    const appSettingTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AppSetting'").get();
    if (!appSettingTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "AppSetting" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");
      `);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[PRISMA SCHEMA SYNC WARNING]:', msg);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close error
      }
    }
  }
};

const getDatabasePath = () => {
  const defaultPath = path.join(process.cwd(), 'prisma', 'dev.db');
  
  // On Vercel / AWS Lambda Serverless platform, /var/task is read-only.
  // os.tmpdir() returns /tmp in serverless execution environments.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpPath = path.join(os.tmpdir(), 'dev.db');
    try {
      if (!fs.existsSync(tmpPath) && fs.existsSync(defaultPath)) {
        fs.copyFileSync(defaultPath, tmpPath);
      }
    } catch (e) {
      console.warn('Failed to copy SQLite database to temp dir, falling back to default path:', e);
      ensureDatabaseSchema(defaultPath);
      return defaultPath;
    }
    ensureDatabaseSchema(tmpPath);
    return tmpPath;
  }

  ensureDatabaseSchema(defaultPath);
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
globalForPrisma.prisma = prisma;

