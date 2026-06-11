export type AnalysisMode = "quick" | "deep";
export type AnalysisStatus = "processing" | "completed" | "failed";

export interface KeyFacts {
  parties: string[];
  dates: string[];
  locations: string[];
  amounts: string[];
}

export interface SectionRef {
  act: string;
  section: string;
  title: string;
  relevance: string;
  oldEquivalent: { act: string; section: string } | null;
}

export interface DetailedAnalysis {
  detailedReasoning: string;
  proceduralRequirements: string[];
  evidentiaryConsiderations: string[];
  similarProvisions: SectionRef[];
  draftingNotes: string;
}

/** Mirrors `toAnalysisDto` in server/src/controllers/legal.controller.ts */
export interface LegalAnalysis {
  id: string;
  sourceDocumentId: string | null;
  mode: AnalysisMode;
  status: AnalysisStatus;
  inputText: string;
  caseType: string | null;
  summary: string | null;
  applicableSections: SectionRef[] | null;
  keyFacts: KeyFacts | null;
  recommendedActions: string[] | null;
  detailedAnalysis: DetailedAnalysis | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `toMappingDto` in server/src/controllers/legal.controller.ts */
export interface BnsSectionMapping {
  id: string;
  category: string;
  oldAct: string;
  oldSection: string;
  newAct: string;
  newSection: string;
  title: string;
}
