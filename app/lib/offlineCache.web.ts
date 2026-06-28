import type { ScannedDocument } from "../types/document";
import type { BnsSectionMapping, LegalAnalysis } from "../types/legal";

// Stands in for lib/offlineCache.ts on web — see lib/scanOutbox.web.ts for
// why. Callers already treat an empty/null result as "nothing cached" (the
// normal case before anything's ever been cached), so this degrades safely.
export async function cacheScans(_documents: ScannedDocument[]): Promise<void> {}

export async function cacheScan(_document: ScannedDocument): Promise<void> {}

export async function getCachedScans(): Promise<ScannedDocument[]> {
  return [];
}

export async function getCachedScan(_id: string): Promise<ScannedDocument | null> {
  return null;
}

export async function cacheLegalAnalyses(_analyses: LegalAnalysis[]): Promise<void> {}

export async function cacheLegalAnalysis(_analysis: LegalAnalysis): Promise<void> {}

export async function getCachedLegalAnalyses(): Promise<LegalAnalysis[]> {
  return [];
}

export async function getCachedLegalAnalysis(_id: string): Promise<LegalAnalysis | null> {
  return null;
}

export async function cacheBnsMappings(_mappings: BnsSectionMapping[]): Promise<void> {}

export async function getCachedBnsMappings(): Promise<BnsSectionMapping[]> {
  return [];
}
