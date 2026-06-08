export type PetitionFormat = "pdf" | "text";
export type JanSunwaiStatus = "pending" | "report_started" | "closed";

export interface JanSunwaiSummary {
  id: string;
  applicationNumber: string;
  assignedIoName: string | null;
  petitionerName: string | null;
  subject: string | null;
  status: JanSunwaiStatus;
  petitionFormat: PetitionFormat;
  reportId: string | null;
  scrapedAt: string | null;
}

export interface JanSunwaiDetail {
  id: string;
  applicationNumber: string;
  assignedIoId: string | null;
  assignedIoName: string | null;
  petitionerName: string | null;
  petitionerAddress: string | null;
  petitionerMobile: string | null;
  subject: string | null;
  description: string | null;
  petitionFormat: PetitionFormat;
  petitionText: string | null;
  /** Short-lived signed download URL — only present when petitionFormat === "pdf". */
  petitionDownloadUrl: string | null;
  status: JanSunwaiStatus;
  reportId: string | null;
  scrapedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
