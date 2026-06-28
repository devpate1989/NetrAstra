import type { PickedScan } from "./documentScan";

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

interface ProcessResult {
  uploaded: number;
  failed: number;
}

// Stands in for lib/scanOutbox.ts on web — a browser tab needed network to
// load in the first place, so there's no real "queue while offline, sync
// later" use case worth pulling expo-sqlite's 600KB+ WASM into every page
// load for. These resolve as "nothing queued" instead.
export async function enqueueScan(_picked: PickedScan): Promise<OutboxItem> {
  throw new Error(
    "You're offline and this scan can't be queued in the web app — please check your connection and try again."
  );
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return [];
}

export async function getOutboxCount(): Promise<number> {
  return 0;
}

export async function removeFromOutbox(_id: string): Promise<void> {}

export async function processOutbox(): Promise<ProcessResult> {
  return { uploaded: 0, failed: 0 };
}
