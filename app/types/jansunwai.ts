export type PetitionFormat = "pdf" | "text";
export type JanSunwaiStatus = "pending" | "report_started" | "closed";
export type AssignmentSource = "manual" | "ai_chowki" | "ai_unmatched" | null;

export interface IgrsApplication {
  id: string;
  applicationNumber: string;
  assignedIoId: string | null;
  assignedIoName: string | null;
  assignedChowkiName: string | null;
  assignmentSource: AssignmentSource;
  petitionerName: string | null;
  petitionerMobile: string | null;
  subject: string | null;
  description: string | null;
  status: JanSunwaiStatus;
  scrapedAt: string | null;
}

export interface IoOfficer {
  id: string;
  fullName: string | null;
  username: string;
}

/** Category-wise (संदर्भ प्रकार) breakdown of unmark / office-pending / total counts. */
export interface ReferenceSummaryRow {
  complaintTypeCode: number;
  complaintTypeName: string;
  unmarkCount: number;
  officePendingCount: number;
  totalPending: number;
  scrapedAt: string | null;
}

export interface JanSunwaiSummary {
  id: string;
  applicationNumber: string;
  assignedIoName: string | null;
  assignedChowkiName: string | null;
  assignmentSource: AssignmentSource;
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
  assignedChowkiName: string | null;
  assignmentSource: AssignmentSource;
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
