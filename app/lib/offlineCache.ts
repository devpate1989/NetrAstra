import { getDb, encryptJson, decryptJson } from "./offlineDb";
import type { ScannedDocument } from "../types/document";
import type { BnsSectionMapping, LegalAnalysis } from "../types/legal";

const SCAN_CACHE_LIMIT = 50;
const ANALYSIS_CACHE_LIMIT = 50;

/** Upserts scanned documents into the local cache, keeping only the most recent SCAN_CACHE_LIMIT entries. */
export async function cacheScans(documents: ScannedDocument[]): Promise<void> {
  if (documents.length === 0) return;
  const db = await getDb();
  for (const doc of documents) {
    const payload = await encryptJson(doc);
    await db.runAsync(`INSERT OR REPLACE INTO cached_scans (id, payload, updated_at) VALUES (?, ?, ?)`, [doc.id, payload, doc.updatedAt]);
  }
  await db.runAsync(
    `DELETE FROM cached_scans WHERE id NOT IN (SELECT id FROM cached_scans ORDER BY updated_at DESC LIMIT ?)`,
    [SCAN_CACHE_LIMIT]
  );
}

export async function cacheScan(document: ScannedDocument): Promise<void> {
  await cacheScans([document]);
}

export async function getCachedScans(): Promise<ScannedDocument[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(`SELECT payload FROM cached_scans ORDER BY updated_at DESC`);
  return Promise.all(rows.map((row) => decryptJson<ScannedDocument>(row.payload)));
}

export async function getCachedScan(id: string): Promise<ScannedDocument | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ payload: string }>(`SELECT payload FROM cached_scans WHERE id = ?`, [id]);
  return row ? decryptJson<ScannedDocument>(row.payload) : null;
}

/** Upserts legal analyses into the local cache, keeping only the most recent ANALYSIS_CACHE_LIMIT entries. */
export async function cacheLegalAnalyses(analyses: LegalAnalysis[]): Promise<void> {
  if (analyses.length === 0) return;
  const db = await getDb();
  for (const analysis of analyses) {
    const payload = await encryptJson(analysis);
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_legal_analyses (id, payload, updated_at) VALUES (?, ?, ?)`,
      [analysis.id, payload, analysis.updatedAt]
    );
  }
  await db.runAsync(
    `DELETE FROM cached_legal_analyses WHERE id NOT IN (SELECT id FROM cached_legal_analyses ORDER BY updated_at DESC LIMIT ?)`,
    [ANALYSIS_CACHE_LIMIT]
  );
}

export async function cacheLegalAnalysis(analysis: LegalAnalysis): Promise<void> {
  await cacheLegalAnalyses([analysis]);
}

export async function getCachedLegalAnalyses(): Promise<LegalAnalysis[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(`SELECT payload FROM cached_legal_analyses ORDER BY updated_at DESC`);
  return Promise.all(rows.map((row) => decryptJson<LegalAnalysis>(row.payload)));
}

export async function getCachedLegalAnalysis(id: string): Promise<LegalAnalysis | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ payload: string }>(`SELECT payload FROM cached_legal_analyses WHERE id = ?`, [id]);
  return row ? decryptJson<LegalAnalysis>(row.payload) : null;
}

/** Replaces the cached IPC/CrPC/Evidence Act -> BNS/BNSS/BSA reference table (small, near-static dataset). */
export async function cacheBnsMappings(mappings: BnsSectionMapping[]): Promise<void> {
  if (mappings.length === 0) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM cached_bns_mappings`);
  for (const mapping of mappings) {
    const payload = await encryptJson(mapping);
    await db.runAsync(`INSERT INTO cached_bns_mappings (id, payload) VALUES (?, ?)`, [mapping.id, payload]);
  }
}

export async function getCachedBnsMappings(): Promise<BnsSectionMapping[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(`SELECT payload FROM cached_bns_mappings`);
  return Promise.all(rows.map((row) => decryptJson<BnsSectionMapping>(row.payload)));
}
