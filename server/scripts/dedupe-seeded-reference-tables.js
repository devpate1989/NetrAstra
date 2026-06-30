// Phase 2 (migration replay) re-seeds chowkis/beats/thana_staff/
// bns_section_mappings with gen_random_uuid() defaults baked into the
// migration SQL itself, then Phase 3 (cloud data copy) added a second copy
// with the cloud's own (different) UUIDs — leaving every row duplicated.
// Deletes the locally-generated half, keeping the cloud-sourced rows (which
// every other table's foreign keys already point to). Cascades automatically
// clean up chowki_villages/chowki_officers/beats via their `on delete
// cascade` FK to chowkis.
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const LOCAL_URL = "postgresql://postgres.your-tenant-id:3460a610b84f35beb7f33b208fd98518@localhost:5433/postgres";

async function dedupe(source, dest, table) {
  const { rows } = await source.query(`select id from public.${table}`);
  const cloudIds = rows.map((r) => r.id);
  const res = await dest.query(`delete from public.${table} where id <> all($1::uuid[])`, [cloudIds]);
  console.log(`  ${table}: deleted ${res.rowCount} locally-seeded duplicate(s), ${cloudIds.length} cloud rows kept`);
}

async function main() {
  const source = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dest = new Client({ connectionString: LOCAL_URL, ssl: false });
  await source.connect();
  await dest.connect();

  // chowkis first — cascades to chowki_villages/chowki_officers/beats
  await dedupe(source, dest, "chowkis");
  await dedupe(source, dest, "thana_staff");
  await dedupe(source, dest, "bns_section_mappings");

  await source.end();
  await dest.end();
}

main().catch((err) => {
  console.error("Dedupe failed:", err.message);
  process.exit(1);
});
