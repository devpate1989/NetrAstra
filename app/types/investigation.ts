export interface Investigation {
  id: string;
  externalReference: string | null;
  policeStation: string | null;
  district: string | null;
  ioName: string | null;
  section: string | null;
  complainantName: string | null;
  caseSummary: string | null;
  caseStatus: string | null;
  registeredOn: string | null;
  scrapedAt: string | null;
  updatedAt: string | null;
}

export interface InvestigationGroup {
  ioName: string;
  cases: Investigation[];
}

export interface ScrapeRunResult {
  ranAt: string;
  scraped: number;
  stored: number;
  skipped: boolean;
  reason?: string;
}
