import { apiRequest } from "./api";
import type { AnalysisMode, BnsSectionMapping, LegalAnalysis } from "../types/legal";

/** Runs Claude legal analysis over pasted text or a previously-scanned document. */
export async function analyzeLegalText(input: { text?: string; documentId?: string; mode: AnalysisMode }): Promise<LegalAnalysis> {
  // Deep research mode in particular can take well over the default timeout.
  const { analysis } = await apiRequest<{ analysis: LegalAnalysis }>("/legal/analyze", {
    method: "POST",
    body: input,
    timeoutMs: 60_000,
  });
  return analysis;
}

export async function getLegalAnalysis(id: string): Promise<LegalAnalysis> {
  const { analysis } = await apiRequest<{ analysis: LegalAnalysis }>(`/legal/${id}`);
  return analysis;
}

export async function listLegalAnalyses(page: number, limit: number): Promise<{ analyses: LegalAnalysis[]; total: number }> {
  return apiRequest<{ analyses: LegalAnalysis[]; total: number }>(`/legal?page=${page}&limit=${limit}`);
}

export async function deleteLegalAnalysis(id: string): Promise<void> {
  await apiRequest(`/legal/${id}`, { method: "DELETE" });
}

/** Searches the curated IPC/CrPC/Evidence Act -> BNS/BNSS/BSA reference table. */
export async function searchBnsMappings(q: string, act?: string): Promise<BnsSectionMapping[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (act) params.set("act", act);
  const query = params.toString();
  const { mappings } = await apiRequest<{ mappings: BnsSectionMapping[] }>(`/legal/bns-lookup${query ? `?${query}` : ""}`);
  return mappings;
}
