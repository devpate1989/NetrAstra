// Applies the SQL files in supabase/migrations/ (in filename order) to the
// Postgres database addressed by SUPABASE_URL — a direct connection string
// (postgresql://...), not the REST URL the JS client uses. Tracks applied
// files in `public._migrations` so re-runs only apply new ones.
// Run with: node scripts/run-migrations.js
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "supabase", "migrations");

async function main() {
  const connectionString = process.env.SUPABASE_URL;
  if (!connectionString || !connectionString.startsWith("postgres")) {
    throw new Error("SUPABASE_URL must be a postgres:// connection string to run migrations directly.");
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to database.");

  try {
    await client.query(`
      create table if not exists public._migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query("select filename from public._migrations");
    const applied = new Set(rows.map((r) => r.filename));
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("Nothing to do — all migrations already applied.");
      return;
    }

    console.log(`Applying ${pending.length} pending migration(s):`);
    pending.forEach((f) => console.log(`  - ${f}`));

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`\nApplying ${file} ...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public._migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log(`  ✓ applied`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Failed applying ${file}: ${err.message}`);
      }
    }
    console.log("\nAll pending migrations applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nMigration run failed:", err.message);
  process.exit(1);
});
