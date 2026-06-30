// One-time data migration: copies every row from the cloud Supabase project
// (read-only — never writes back) into the self-hosted Postgres instance
// started via `selfhost/docker-compose.yml`. Safe to re-run: every insert
// uses ON CONFLICT DO NOTHING.
//
// Run with: node scripts/migrate-data-to-selfhosted.js
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const LOCAL_URL = "postgresql://postgres.your-tenant-id:3460a610b84f35beb7f33b208fd98518@localhost:5433/postgres";

// auth first (identities depend on users), then public tables in an order
// that's mostly dependency-friendly — though session_replication_role below
// makes the exact order safe regardless.
const TABLES = [
  { schema: "auth", name: "users" },
  { schema: "auth", name: "identities" },
  { schema: "public", name: "profiles" },
  { schema: "public", name: "chowkis" },
  { schema: "public", name: "chowki_villages" },
  { schema: "public", name: "chowki_officers" },
  { schema: "public", name: "beats" },
  { schema: "public", name: "thana_staff" },
  { schema: "public", name: "bns_section_mappings" },
  { schema: "public", name: "jansunwai_applications" },
  { schema: "public", name: "jansunwai_reference_summary" },
  { schema: "public", name: "investigations" },
  { schema: "public", name: "reports" },
  { schema: "public", name: "report_acts_sections" },
  { schema: "public", name: "report_attachments" },
  { schema: "public", name: "report_signoffs" },
  { schema: "public", name: "report_witnesses" },
  { schema: "public", name: "scanned_documents" },
  { schema: "public", name: "legal_analyses" },
  { schema: "public", name: "audit_log" },
  { schema: "public", name: "notifications" },
];

async function getGeneratedColumns(dest, schema, name) {
  const { rows } = await dest.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'ALWAYS'`,
    [schema, name]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function copyTable(source, dest, schema, name) {
  const { rows } = await source.query(`select * from "${schema}"."${name}"`);
  if (rows.length === 0) {
    console.log(`  ${schema}.${name}: 0 rows, skipping`);
    return { table: `${schema}.${name}`, copied: 0, total: 0 };
  }

  const generated = await getGeneratedColumns(dest, schema, name);
  const columns = Object.keys(rows[0]).filter((c) => !generated.has(c));
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let copied = 0;

  for (const row of rows) {
    // pg parses jsonb/json columns into JS objects on SELECT but won't
    // re-serialize them automatically when passed back as INSERT params.
    const values = columns.map((c) => {
      const v = row[c];
      return v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)
        ? JSON.stringify(v)
        : v;
    });
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const res = await dest.query(
      `insert into "${schema}"."${name}" (${colList}) values (${placeholders}) on conflict do nothing`,
      values
    );
    copied += res.rowCount;
  }

  console.log(`  ${schema}.${name}: ${copied}/${rows.length} rows inserted`);
  return { table: `${schema}.${name}`, copied, total: rows.length };
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("DATABASE_URL not found in root .env");

  const source = new Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
  const dest = new Client({ connectionString: LOCAL_URL, ssl: false });

  await source.connect();
  await dest.connect();
  console.log("Connected to both cloud (source, read-only) and local (dest) databases.\n");

  // Disable FK/trigger enforcement for the bulk load so table order doesn't
  // matter — re-enabled in the `finally` block below either way.
  await dest.query("SET session_replication_role = replica;");

  const results = [];
  try {
    for (const { schema, name } of TABLES) {
      results.push(await copyTable(source, dest, schema, name));
    }
  } finally {
    await dest.query("SET session_replication_role = DEFAULT;");
  }

  console.log("\nDone. Summary:");
  for (const r of results) {
    const flag = r.copied !== r.total ? "  <-- check this one (some rows skipped, likely already present)" : "";
    console.log(`  ${r.table.padEnd(35)} ${String(r.copied).padStart(4)}/${r.total}${flag}`);
  }

  await source.end();
  await dest.end();
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
