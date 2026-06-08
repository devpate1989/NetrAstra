export type ReportStatus = "draft" | "submitted" | "pdf_generated";
export type DisputeCategory = "land" | "domestic" | "illegal_possession" | "other";
export type AttachmentKind = "site_photo" | "up112_report" | "compromise_document" | "signature" | "other";

export interface ReportWitness {
  id?: string;
  name?: string | null;
  address?: string | null;
  mobile?: string | null;
  statement?: string | null;
}

export interface ReportActsSection {
  id?: string;
  sNo?: number | null;
  act?: string | null;
  section?: string | null;
}

export interface ReportSignoff {
  id?: string;
  label?: string | null;
  name?: string | null;
  rank?: string | null;
  number?: string | null;
  signatureUrl?: string | null;
}

export interface ReportAttachment {
  id: string;
  kind: AttachmentKind;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  previewUrl: string | null;
}

export interface ReportSummary {
  id: string;
  officerId: string;
  status: ReportStatus;
  referenceNumber?: string | null;
  reportDate?: string | null;
  complainantName?: string | null;
  oppositePartyName?: string | null;
  disputeCategory?: DisputeCategory | null;
  ioName?: string | null;
  hasPdf: boolean;
  jansunwaiApplicationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors `rowToDetailDto` in server/src/controllers/reports.controller.ts —
 * one camelCase field per `reports` column (see REPORT_FIELDS there for the
 * authoritative snake_case <-> camelCase mapping), plus the repeatable child
 * groups and signed preview URLs for any stored files.
 */
export interface ReportDetail {
  id: string;
  officerId: string;
  status: ReportStatus;
  jansunwaiApplicationId?: string | null;
  generatedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  addresseeDistrict?: string | null;
  referenceNumber?: string | null;
  reportDate?: string | null;

  complainantName?: string | null;
  complainantAddress?: string | null;
  complainantMobile?: string | null;

  oppositePartyName?: string | null;
  oppositePartyAddress?: string | null;
  oppositePartyMobile?: string | null;

  complaintDescription?: string | null;

  ioName?: string | null;
  ioDesignation?: string | null;
  ioMobile?: string | null;

  firDetails?: string | null;

  disputeCategory?: DisputeCategory | null;
  disputeCategoryNote?: string | null;

  complainantStatement?: string | null;
  oppositePartyStatement?: string | null;
  witnesses: ReportWitness[];

  priorOffenceDetails?: string | null;
  landDisputeTeamDetails?: string | null;
  bondSection126135Details?: string | null;
  priorApplicationDetails?: string | null;
  priorApplicationChronology?: string | null;

  up112Informed?: boolean | null;
  up112ReportUrl?: string | null;
  up112ReportPreviewUrl?: string | null;

  section170Details?: string | null;
  courtCaseDetails?: string | null;

  siteVisitDate?: string | null;
  siteVisitLatitude?: number | null;
  siteVisitLongitude?: number | null;
  siteVisitPhotoUrl?: string | null;
  siteVisitPhotoPreviewUrl?: string | null;

  compromiseDetails?: string | null;
  compromiseAttachmentUrl?: string | null;
  compromiseAttachmentPreviewUrl?: string | null;

  analyticalConclusion?: string | null;
  feedbackNotes?: string | null;

  isComplainantSatisfied?: boolean | null;
  dissatisfactionDetails?: string | null;

  otherComments?: string | null;

  signedName?: string | null;
  signedDesignation?: string | null;
  signedPoliceStation?: string | null;
  signedDistrict?: string | null;
  signedDate?: string | null;
  signatureUrl?: string | null;
  signaturePreviewUrl?: string | null;

  gdState?: string | null;
  gdPoliceStation?: string | null;
  gdDistrict?: string | null;
  gdNo?: string | null;
  gdDate?: string | null;
  gdType?: string | null;
  gdEntryOfficer?: string | null;
  gdCaseType?: string | null;
  gdBrief?: string | null;
  gdSubject?: string | null;
  actsSections: ReportActsSection[];
  gdReportPrintedOn?: string | null;
  gdReportPrintedByName?: string | null;
  gdReportPrintedByRank?: string | null;
  gdReportPrintedByNumber?: string | null;
  signoffs: ReportSignoff[];

  attachments: ReportAttachment[];
  pdfUrl?: string | null;
  pdfDownloadUrl?: string | null;
}

/** Payload shape accepted by `PATCH /reports/:id` — every field optional (autosave-friendly). */
export type ReportUpdateInput = Partial<
  Omit<
    ReportDetail,
    | "id"
    | "officerId"
    | "status"
    | "jansunwaiApplicationId"
    | "generatedAt"
    | "createdAt"
    | "updatedAt"
    | "attachments"
    | "pdfUrl"
    | "pdfDownloadUrl"
    | "siteVisitPhotoPreviewUrl"
    | "signaturePreviewUrl"
    | "up112ReportPreviewUrl"
    | "compromiseAttachmentPreviewUrl"
  >
>;
