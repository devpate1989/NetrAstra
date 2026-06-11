import * as Crypto from "expo-crypto";
import { getDb, encryptJson, decryptJson } from "./offlineDb";
import { uploadScan, type PickedScan } from "./documentScan";
import { cacheScan } from "./offlineCache";

export type OutboxStatus = "pending" | "uploading" | "failed";

export interface OutboxItem {
  id: string;
  source: PickedScan["source"];
  fileName: string;
  mimeType: string;
  status: OutboxStatus;
  errorMessage: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  source: string;
  file_name: string;
  mime_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

function fromRow(row: OutboxRow): OutboxItem {
  return {
    id: row.id,
    source: row.source as PickedScan["source"],
    fileName: row.file_name,
    mimeType: row.mime_type,
    status: row.status as OutboxStatus,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

/** Saves a captured scan locally (encrypted) for upload once connectivity returns. */
export async function enqueueScan(picked: PickedScan): Promise<OutboxItem> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = await encryptJson(picked);

  await db.runAsync(
    `INSERT INTO scan_outbox (id, source, file_name, mime_type, payload, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`,
    [id, picked.source, picked.fileName, picked.mimeType, payload, createdAt]
  );

  return { id, source: picked.source, fileName: picked.fileName, mimeType: picked.mimeType, status: "pending", errorMessage: null, createdAt };
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT id, source, file_name, mime_type, status, error_message, created_at FROM scan_outbox ORDER BY created_at ASC`
  );
  return rows.map(fromRow);
}

export async function getOutboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM scan_outbox`);
  return row?.count ?? 0;
}

export async function removeFromOutbox(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM scan_outbox WHERE id = ?`, [id]);
}

interface ProcessResult {
  uploaded: number;
  failed: number;
}

let processing = false;

/** Uploads every queued scan, removing it from the outbox on success and recording the error on failure. */
export async function processOutbox(): Promise<ProcessResult> {
  if (processing) return { uploaded: 0, failed: 0 };
  processing = true;

  let uploaded = 0;
  let failed = 0;

  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string; payload: string }>(
      `SELECT id, payload FROM scan_outbox WHERE status != 'uploading' ORDER BY created_at ASC`
    );

    for (const row of rows) {
      await db.runAsync(`UPDATE scan_outbox SET status = 'uploading', error_message = NULL WHERE id = ?`, [row.id]);
      try {
        const picked = await decryptJson<PickedScan>(row.payload);
        const document = await uploadScan(picked);
        await cacheScan(document);
        await db.runAsync(`DELETE FROM scan_outbox WHERE id = ?`, [row.id]);
        uploaded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        await db.runAsync(`UPDATE scan_outbox SET status = 'failed', error_message = ? WHERE id = ?`, [message, row.id]);
        failed += 1;
      }
    }
  } finally {
    processing = false;
  }

  return { uploaded, failed };
}
