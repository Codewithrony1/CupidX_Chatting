const fs = require('fs');
const path = require('path');

function syncDatasource() {
  const schemaPath = path.join(__dirname, 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    console.log('[PRISMA SYNC] schema.prisma not found, skipping sync.');
    return;
  }

  const rawUrl =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    '';

  const isPostgres =
    rawUrl.startsWith('postgresql://') ||
    rawUrl.startsWith('postgres://');

  const targetProvider = isPostgres ? 'postgresql' : 'sqlite';
  let schema = fs.readFileSync(schemaPath, 'utf8');

  if (targetProvider === 'postgresql') {
    schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  } else {
    schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
  }

  fs.writeFileSync(schemaPath, schema, 'utf8');
  console.log(`[PRISMA SYNC] Datasource provider synchronized to: "${targetProvider}"`);
}

if (require.main === module) {
  syncDatasource();
}

module.exports = { syncDatasource };
