const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function ensureDatabaseSchema(targetDbPath) {
  if (!targetDbPath || !fs.existsSync(targetDbPath)) {
    return;
  }

  let db;
  try {
    db = new Database(targetDbPath);

    // 1. Inspect and ensure User table columns
    const userTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get();
    if (userTable) {
      const userCols = db.pragma('table_info("User")').map((c) => c.name);
      
      if (!userCols.includes('profileCompleted')) {
        console.log(`[SCHEMA SYNC] Adding User.profileCompleted to ${targetDbPath}`);
        db.exec('ALTER TABLE "User" ADD COLUMN profileCompleted BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('profileLocked')) {
        console.log(`[SCHEMA SYNC] Adding User.profileLocked to ${targetDbPath}`);
        db.exec('ALTER TABLE "User" ADD COLUMN profileLocked BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('genderDobLocked')) {
        console.log(`[SCHEMA SYNC] Adding User.genderDobLocked to ${targetDbPath}`);
        db.exec('ALTER TABLE "User" ADD COLUMN genderDobLocked BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!userCols.includes('clerkUserId')) {
        console.log(`[SCHEMA SYNC] Adding User.clerkUserId to ${targetDbPath}`);
        db.exec('ALTER TABLE "User" ADD COLUMN clerkUserId TEXT;');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_key" ON "User"("clerkUserId");');
      }

      // Existing user preservation: if user already has DOB + Gender set, mark profileCompleted
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
      const profileCols = db.pragma('table_info("Profile")').map((c) => c.name);

      if (!profileCols.includes('profileCompleted')) {
        console.log(`[SCHEMA SYNC] Adding Profile.profileCompleted to ${targetDbPath}`);
        db.exec('ALTER TABLE "Profile" ADD COLUMN profileCompleted BOOLEAN NOT NULL DEFAULT 0;');
      }
      if (!profileCols.includes('profileLocked')) {
        console.log(`[SCHEMA SYNC] Adding Profile.profileLocked to ${targetDbPath}`);
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
      console.log(`[SCHEMA SYNC] Creating AppSetting table in ${targetDbPath}`);
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
    console.warn(`[SCHEMA SYNC WARNING] ${targetDbPath}:`, err.message);
  } finally {
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
  }
}

if (require.main === module) {
  const defaultPath = path.join(__dirname, 'dev.db');
  console.log(`Ensuring schema on ${defaultPath}...`);
  ensureDatabaseSchema(defaultPath);
  console.log('Schema check completed.');
}

module.exports = { ensureDatabaseSchema };
