import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { generateReportPdf, ReportPdfData } from "../services/reportPdf.service";
import { logAudit } from "../services/audit.service";

// ---------------------------------------------------------------------------
// snake_case (DB column) <-> camelCase (API field) mapping for `reports`.
// Listed explicitly (rather than derived by a generic case-converter) because
// a couple of columns mix words and digits (e.g. bond_section_126_135_details)
// where a regex-based converter would be ambiguous.
// ---------------------------------------------------------------------------
const REPORT_FIELDS: Array<[api: string, db: string]> = [
  ["addresseeDistrict", "addressee_district"],
  ["referenceNumber", "reference_number"],
  ["reportDate", "report_date"],

  ["complainantName", "complainant_name"],
  ["complainantAddress", "complainant_address"],
  ["complainantMobile", "complainant_mobile"],

  ["oppositePartyName", "opposite_party_name"],
  ["oppositePartyAddress", "opposite_party_address"],
  ["oppositePartyMobile", "opposite_party_mobile"],

  ["complaintDescription", "complaint_description"],

  ["ioName", "io_name"],
  ["ioDesignation", "io_designation"],
  ["ioMobile", "io_mobile"],

  ["firDetails", "fir_details"],

  ["disputeCategory", "dispute_category"],
  ["disputeCategoryNote", "dispute_category_note"],

  ["complainantStatement", "complainant_statement"],
  ["oppositePartyStatement", "opposite_party_statement"],

  ["priorOffenceDetails", "prior_offence_details"],
  ["landDisputeTeamDetails", "land_dispute_team_details"],
  ["bondSection126135Details", "bond_section_126_135_details"],
  ["priorApplicationDetails", "prior_application_details"],
  ["priorApplicationChronology", "prior_application_chronology"],

  ["up112Informed", "up112_informed"],
  ["up112ReportUrl", "up112_report_url"],

  ["section170Details", "section_170_details"],
  ["courtCaseDetails", "court_case_details"],

  ["siteVisitDate", "site_visit_date"],
  ["siteVisitLatitude", "site_visit_latitude"],
  ["siteVisitLongitude", "site_visit_longitude"],
  ["siteVisitPhotoUrl", "site_visit_photo_url"],

  ["compromiseDetails", "compromise_details"],
  ["compromiseAttachmentUrl", "compromise_attachment_url"],

  ["analyticalConclusion", "analytical_conclusion"],
  ["feedbackNotes", "feedback_notes"],

  ["isComplainantSatisfied", "is_complainant_satisfied"],
  ["dissatisfactionDetails", "dissatisfaction_details"],

  ["otherComments", "other_comments"],

  ["signedName", "signed_name"],
  ["signedDesignation", "signed_designation"],
  ["signedPoliceStation", "signed_police_station"],
  ["signedDistrict", "signed_district"],
  ["signedDate", "signed_date"],
  ["signatureUrl", "signature_url"],

  ["gdState", "gd_state"],
  ["gdPoliceStation", "gd_police_station"],
  ["gdDistrict", "gd_district"],
  ["gdNo", "gd_no"],
  ["gdDate", "gd_date"],
  ["gdType", "gd_type"],
  ["gdEntryOfficer", "gd_entry_officer"],
  ["gdCaseType", "gd_case_type"],
  ["gdBrief", "gd_brief"],
  ["gdSubject", "gd_subject"],
  ["gdReportPrintedOn", "gd_report_printed_on"],
  ["gdReportPrintedByName", "gd_report_printed_by_name"],
  ["gdReportPrintedByRank", "gd_report_printed_by_rank"],
  ["gdReportPrintedByNumber", "gd_report_printed_by_number"],
];

const REPORT_SELECT_COLUMNS = [
  "id",
  "officer_id",
  "status",
  ...REPORT_FIELDS.map(([, db]) => db),
  "jansunwai_application_id",
  "pdf_url",
  "generated_at",
  "created_at",
  "updated_at",
].join(", ");

// Storage object paths use the "<owner_user_id>/..." convention enforced by RLS
// (see supabase/migrations/20260608090500_storage.sql). The "*_url" columns on
// `reports` therefore hold storage *paths*, not public URLs — the buckets are
// private, so callers must exchange a path for a short-lived signed URL.
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const PDF_BUCKET = "report-pdfs";
const ATTACHMENTS_BUCKET = "report-attachments";

async function signPath(bucket: string, pathValue: string | null | undefined): Promise<string | null> {
  if (!pathValue) return null;
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(pathValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function rowToSummaryDto(row: Record<string, any>) {
  return {
    id: row.id,
    officerId: row.officer_id,
    status: row.status,
    referenceNumber: row.reference_number,
    reportDate: row.report_date,
    complainantName: row.complainant_name,
    oppositePartyName: row.opposite_party_name,
    disputeCategory: row.dispute_category,
    ioName: row.io_name,
    hasPdf: Boolean(row.pdf_url),
    jansunwaiApplicationId: row.jansunwai_application_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rowToDetailDto(row: Record<string, any>) {
  const dto: Record<string, any> = {
    id: row.id,
    officerId: row.officer_id,
    status: row.status,
    jansunwaiApplicationId: row.jansunwai_application_id,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  for (const [api, db] of REPORT_FIELDS) {
    dto[api] = row[db] ?? null;
  }

  const [witnesses, actsSections, signoffs, attachments] = await Promise.all([
    supabaseAdmin
      .from("report_witnesses")
      .select("id, position, name, address, mobile, statement")
      .eq("report_id", row.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("report_acts_sections")
      .select("id, position, s_no, act, section")
      .eq("report_id", row.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("report_signoffs")
      .select("id, position, label, name, rank, number, signature_url")
      .eq("report_id", row.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("report_attachments")
      .select("id, kind, file_url, caption, latitude, longitude, created_at")
      .eq("report_id", row.id)
      .order("created_at", { ascending: true }),
  ]);

  dto.witnesses = (witnesses.data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    address: w.address,
    mobile: w.mobile,
    statement: w.statement,
  }));
  dto.actsSections = (actsSections.data ?? []).map((a) => ({
    id: a.id,
    sNo: a.s_no,
    act: a.act,
    section: a.section,
  }));
  dto.signoffs = (signoffs.data ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    name: s.name,
    rank: s.rank,
    number: s.number,
    signatureUrl: s.signature_url,
  }));

  dto.attachments = await Promise.all(
    (attachments.data ?? []).map(async (a) => ({
      id: a.id,
      kind: a.kind,
      caption: a.caption,
      latitude: a.latitude,
      longitude: a.longitude,
      createdAt: a.created_at,
      previewUrl: await signPath(ATTACHMENTS_BUCKET, a.file_url),
    }))
  );

  dto.siteVisitPhotoPreviewUrl = await signPath(ATTACHMENTS_BUCKET, row.site_visit_photo_url);
  dto.signaturePreviewUrl = await signPath(ATTACHMENTS_BUCKET, row.signature_url);
  dto.up112ReportPreviewUrl = await signPath(ATTACHMENTS_BUCKET, row.up112_report_url);
  dto.compromiseAttachmentPreviewUrl = await signPath(ATTACHMENTS_BUCKET, row.compromise_attachment_url);
  dto.pdfDownloadUrl = await signPath(PDF_BUCKET, row.pdf_url);

  return dto;
}

// Express's ParamsDictionary types values as `string | string[]` to allow for
// repeating route segments; our routes never use those, so this is always a string.
function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

async function loadReportOr404(reportId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("reports")
    .select(REPORT_SELECT_COLUMNS)
    .eq("id", reportId)
    .single();

  if (error || !row) {
    throw new HttpError(404, "Report not found");
  }
  return row as Record<string, any>;
}

function assertCanRead(row: Record<string, any>, user: { id: string; role: string }) {
  if (row.officer_id !== user.id && user.role !== "sho" && user.role !== "admin") {
    throw new HttpError(403, "You do not have permission to view this report");
  }
}

function assertOwns(row: Record<string, any>, user: { id: string; role: string }) {
  if (row.officer_id !== user.id) {
    throw new HttpError(403, "Only the officer who started this report may modify it");
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullish();
const textField = z.string().nullish();
const boolField = z.boolean().nullish();
const numberField = z.number().nullish();

const reportInputSchema = z
  .object({
    addresseeDistrict: textField,
    referenceNumber: textField,
    reportDate: dateField,

    complainantName: textField,
    complainantAddress: textField,
    complainantMobile: textField,

    oppositePartyName: textField,
    oppositePartyAddress: textField,
    oppositePartyMobile: textField,

    complaintDescription: textField,

    ioName: textField,
    ioDesignation: textField,
    ioMobile: textField,

    firDetails: textField,

    disputeCategory: z.enum(["land", "domestic", "illegal_possession", "other"]).nullish(),
    disputeCategoryNote: textField,

    complainantStatement: textField,
    oppositePartyStatement: textField,

    priorOffenceDetails: textField,
    landDisputeTeamDetails: textField,
    bondSection126135Details: textField,
    priorApplicationDetails: textField,
    priorApplicationChronology: textField,

    up112Informed: boolField,
    up112ReportUrl: textField,

    section170Details: textField,
    courtCaseDetails: textField,

    siteVisitDate: dateField,
    siteVisitLatitude: numberField,
    siteVisitLongitude: numberField,
    siteVisitPhotoUrl: textField,

    compromiseDetails: textField,
    compromiseAttachmentUrl: textField,

    analyticalConclusion: textField,
    feedbackNotes: textField,

    isComplainantSatisfied: boolField,
    dissatisfactionDetails: textField,

    otherComments: textField,

    signedName: textField,
    signedDesignation: textField,
    signedPoliceStation: textField,
    signedDistrict: textField,
    signedDate: dateField,
    signatureUrl: textField,

    gdState: textField,
    gdPoliceStation: textField,
    gdDistrict: textField,
    gdNo: textField,
    gdDate: dateField,
    gdType: textField,
    gdEntryOfficer: textField,
    gdCaseType: textField,
    gdBrief: textField,
    gdSubject: textField,
    gdReportPrintedOn: dateField,
    gdReportPrintedByName: textField,
    gdReportPrintedByRank: textField,
    gdReportPrintedByNumber: textField,

    witnesses: z
      .array(
        z.object({
          name: textField,
          address: textField,
          mobile: textField,
          statement: textField,
        })
      )
      .optional(),
    actsSections: z
      .array(
        z.object({
          sNo: z.number().int().nullish(),
          act: textField,
          section: textField,
        })
      )
      .optional(),
    signoffs: z
      .array(
        z.object({
          label: textField,
          name: textField,
          rank: textField,
          number: textField,
          signatureUrl: textField,
        })
      )
      .optional(),
  })
  .partial();

const createReportSchema = z.object({
  jansunwaiApplicationId: z.string().uuid().optional(),
});

const attachmentKindSchema = z.enum(["site_photo", "up112_report", "compromise_document", "signature", "other"]);

// ---------------------------------------------------------------------------
// List / create
// ---------------------------------------------------------------------------

export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  let query = supabaseAdmin.from("reports").select(REPORT_SELECT_COLUMNS).order("updated_at", { ascending: false });

  if (user.role === "io") {
    query = query.eq("officer_id", user.id);
  } else {
    // SHO/Admin oversight — optionally narrow to one officer.
    const officerId = typeof req.query.officerId === "string" ? req.query.officerId : undefined;
    if (officerId) query = query.eq("officer_id", officerId);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(400, error.message);

  res.json({ reports: (data ?? []).map(rowToSummaryDto) });
});

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "io") {
    throw new HttpError(403, "Only Investigating Officers can start a new report");
  }

  const input = createReportSchema.parse(req.body ?? {});
  const insertRow: Record<string, any> = {
    officer_id: user.id,
    status: "draft",
    io_name: user.fullName ?? null,
    io_mobile: null,
    signed_police_station: user.policeStation ?? null,
    signed_district: user.district ?? null,
    addressee_district: user.district ?? null,
  };

  let jansunwai: Record<string, any> | null = null;
  if (input.jansunwaiApplicationId) {
    const { data, error } = await supabaseAdmin
      .from("jansunwai_applications")
      .select("id, assigned_io_id, petitioner_name, petitioner_address, petitioner_mobile, subject, description, status")
      .eq("id", input.jansunwaiApplicationId)
      .single();

    if (error || !data) throw new HttpError(404, "Jan Sunwai application not found");
    if (data.assigned_io_id !== user.id) {
      throw new HttpError(403, "This application is not assigned to you");
    }

    jansunwai = data;
    insertRow.jansunwai_application_id = data.id;
    insertRow.complainant_name = data.petitioner_name ?? null;
    insertRow.complainant_address = data.petitioner_address ?? null;
    insertRow.complainant_mobile = data.petitioner_mobile ?? null;
    insertRow.complaint_description = [data.subject, data.description].filter(Boolean).join("\n\n") || null;
  }

  const { data: createdRaw, error: insertError } = await supabaseAdmin
    .from("reports")
    .insert(insertRow)
    .select(REPORT_SELECT_COLUMNS)
    .single();

  if (insertError || !createdRaw) {
    throw new HttpError(400, insertError?.message ?? "Could not create report");
  }
  // supabase-js can't infer a row type from a runtime-built select string, so it
  // falls back to a generic error union — the null-check above already proved
  // this is a real row.
  const created = createdRaw as unknown as Record<string, any>;

  if (jansunwai) {
    await supabaseAdmin
      .from("jansunwai_applications")
      .update({ status: "report_started", report_id: created.id })
      .eq("id", jansunwai.id);
  }

  res.status(201).json(await rowToDetailDto(created));
});

// ---------------------------------------------------------------------------
// Get / update / delete
// ---------------------------------------------------------------------------

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const row = await loadReportOr404(paramId(req));
  assertCanRead(row, req.user!);
  res.json(await rowToDetailDto(row));
});

async function replaceChildRows(
  table: "report_witnesses" | "report_acts_sections" | "report_signoffs",
  reportId: string,
  rows: Array<Record<string, any>> | undefined
) {
  if (rows === undefined) return;

  const { error: deleteError } = await supabaseAdmin.from(table).delete().eq("report_id", reportId);
  if (deleteError) throw new HttpError(400, deleteError.message);

  if (rows.length === 0) return;

  const payload = rows.map((row, index) => ({ ...row, report_id: reportId, position: index }));
  const { error: insertError } = await supabaseAdmin.from(table).insert(payload);
  if (insertError) throw new HttpError(400, insertError.message);
}

export const updateReport = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await loadReportOr404(paramId(req));
  assertOwns(existing, user);

  if (existing.status !== "draft") {
    throw new HttpError(409, "Submitted reports are read-only. Start a fresh report to make further changes.");
  }

  const input = reportInputSchema.parse(req.body ?? {});
  const { witnesses, actsSections, signoffs, ...scalarInput } = input;

  const updateRow: Record<string, any> = {};
  for (const [api, db] of REPORT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(scalarInput, api)) {
      updateRow[db] = (scalarInput as Record<string, any>)[api] ?? null;
    }
  }

  if (Object.keys(updateRow).length > 0) {
    const { error: updateError } = await supabaseAdmin.from("reports").update(updateRow).eq("id", existing.id);
    if (updateError) throw new HttpError(400, updateError.message);
  }

  await replaceChildRows("report_witnesses", existing.id, witnesses);
  await replaceChildRows(
    "report_acts_sections",
    existing.id,
    actsSections?.map((row) => ({ s_no: row.sNo ?? null, act: row.act ?? null, section: row.section ?? null }))
  );
  await replaceChildRows(
    "report_signoffs",
    existing.id,
    signoffs?.map((row) => ({
      label: row.label ?? null,
      name: row.name ?? null,
      rank: row.rank ?? null,
      number: row.number ?? null,
      signature_url: row.signatureUrl ?? null,
    }))
  );

  const refreshed = await loadReportOr404(existing.id);
  res.json(await rowToDetailDto(refreshed));
});

export const deleteReport = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await loadReportOr404(paramId(req));
  assertOwns(existing, user);

  if (existing.status !== "draft") {
    throw new HttpError(409, "Only draft reports can be deleted");
  }

  const { error } = await supabaseAdmin.from("reports").delete().eq("id", existing.id);
  if (error) throw new HttpError(400, error.message);

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// File uploads (site photo, signature, supporting documents)
// ---------------------------------------------------------------------------

const uploadFileSchema = z.object({
  kind: attachmentKindSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  caption: z.string().trim().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// The client sends the raw bytes as base64 JSON (mirrors app/lib/avatar.ts) rather
// than multipart/form-data — this keeps a single upload code path that works
// uniformly on web, iOS and Android via expo-image-picker / expo-document-picker.
export const uploadReportFile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await loadReportOr404(paramId(req));
  assertOwns(existing, user);

  if (existing.status !== "draft") {
    throw new HttpError(409, "Submitted reports are read-only");
  }

  const input = uploadFileSchema.parse(req.body ?? {});
  const buffer = Buffer.from(input.base64, "base64");
  if (buffer.length === 0) {
    throw new HttpError(400, "Uploaded file is empty");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "Uploaded file exceeds the 15 MB limit");
  }

  const ext = (input.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const objectPath = `${user.id}/${existing.id}/${input.kind}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(objectPath, buffer, { contentType: input.mimeType, upsert: true });

  if (uploadError) {
    throw new HttpError(400, uploadError.message);
  }

  const kind = input.kind;
  const caption = input.caption ?? null;
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;

  const { error: insertError } = await supabaseAdmin.from("report_attachments").insert({
    report_id: existing.id,
    kind,
    file_url: objectPath,
    caption,
    latitude,
    longitude,
  });
  if (insertError) throw new HttpError(400, insertError.message);

  // Convenience: keep the report's primary "kind" columns pointed at the latest upload
  // of that kind, so the PDF generator (and the form's preview) always has a single
  // canonical source without the user having to separately "select" an attachment.
  const primaryColumnByKind: Record<string, string | null> = {
    site_photo: "site_visit_photo_url",
    signature: "signature_url",
    up112_report: "up112_report_url",
    compromise_document: "compromise_attachment_url",
    other: null,
  };
  const primaryColumn = primaryColumnByKind[kind];
  if (primaryColumn) {
    const patch: Record<string, any> = { [primaryColumn]: objectPath };
    if (kind === "site_photo") {
      if (latitude !== null) patch.site_visit_latitude = latitude;
      if (longitude !== null) patch.site_visit_longitude = longitude;
    }
    await supabaseAdmin.from("reports").update(patch).eq("id", existing.id);
  }

  const previewUrl = await signPath(ATTACHMENTS_BUCKET, objectPath);
  res.status(201).json({ path: objectPath, kind, caption, latitude, longitude, previewUrl });
});

// ---------------------------------------------------------------------------
// Submit + generate PDF
// ---------------------------------------------------------------------------

const REQUIRED_FOR_SUBMISSION: Array<[db: string, label: string]> = [
  ["reference_number", "Reference number"],
  ["report_date", "Report date"],
  ["complainant_name", "Complainant's name"],
  ["opposite_party_name", "Opposite party's name"],
  ["io_name", "Investigating Officer's name"],
  ["analytical_conclusion", "Analytical conclusion"],
  ["signed_name", "Signing officer's name"],
];

async function downloadAsBuffer(bucket: string, pathValue: string | null | undefined): Promise<Buffer | null> {
  if (!pathValue) return null;
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(pathValue);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const submitReport = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await loadReportOr404(paramId(req));
  assertOwns(existing, user);

  if (existing.status !== "draft") {
    throw new HttpError(409, "This report has already been submitted");
  }

  const missing = REQUIRED_FOR_SUBMISSION.filter(([db]) => {
    const value = existing[db];
    return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  }).map(([, label]) => label);

  if (missing.length > 0) {
    throw new HttpError(422, `Please complete the following before submitting: ${missing.join(", ")}`, { missing });
  }

  const [witnessesRes, actsSectionsRes, signoffsRes] = await Promise.all([
    supabaseAdmin
      .from("report_witnesses")
      .select("name, address, mobile, statement")
      .eq("report_id", existing.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("report_acts_sections")
      .select("s_no, act, section")
      .eq("report_id", existing.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("report_signoffs")
      .select("label, name, rank, number")
      .eq("report_id", existing.id)
      .order("position", { ascending: true }),
  ]);

  const [sitePhotoBuffer, signatureBuffer] = await Promise.all([
    downloadAsBuffer(ATTACHMENTS_BUCKET, existing.site_visit_photo_url),
    downloadAsBuffer(ATTACHMENTS_BUCKET, existing.signature_url),
  ]);

  const pdfData: ReportPdfData = {
    referenceNumber: existing.reference_number,
    addresseeDistrict: existing.addressee_district,
    reportDate: existing.report_date,

    complainantName: existing.complainant_name,
    complainantAddress: existing.complainant_address,
    complainantMobile: existing.complainant_mobile,

    oppositePartyName: existing.opposite_party_name,
    oppositePartyAddress: existing.opposite_party_address,
    oppositePartyMobile: existing.opposite_party_mobile,

    complaintDescription: existing.complaint_description,

    ioName: existing.io_name,
    ioDesignation: existing.io_designation,
    ioMobile: existing.io_mobile,

    firDetails: existing.fir_details,

    disputeCategory: existing.dispute_category,
    disputeCategoryNote: existing.dispute_category_note,

    complainantStatement: existing.complainant_statement,
    oppositePartyStatement: existing.opposite_party_statement,

    witnesses: witnessesRes.data ?? [],

    priorOffenceDetails: existing.prior_offence_details,
    landDisputeTeamDetails: existing.land_dispute_team_details,
    bondSection126135Details: existing.bond_section_126_135_details,
    priorApplicationDetails: existing.prior_application_details,

    up112Informed: existing.up112_informed,
    up112ReportUrl: existing.up112_report_url,

    section170Details: existing.section_170_details,
    courtCaseDetails: existing.court_case_details,

    siteVisitDate: existing.site_visit_date,
    sitePhoto: sitePhotoBuffer
      ? {
          imageBuffer: sitePhotoBuffer,
          caption: null,
          latitude: existing.site_visit_latitude,
          longitude: existing.site_visit_longitude,
        }
      : null,

    priorApplicationChronology: existing.prior_application_chronology,

    compromiseDetails: existing.compromise_details,
    compromiseAttachmentUrl: existing.compromise_attachment_url,

    analyticalConclusion: existing.analytical_conclusion,
    feedbackNotes: existing.feedback_notes,

    isComplainantSatisfied: existing.is_complainant_satisfied,
    dissatisfactionDetails: existing.dissatisfaction_details,

    otherComments: existing.other_comments,

    signedName: existing.signed_name,
    signedDesignation: existing.signed_designation,
    signedPoliceStation: existing.signed_police_station,
    signedDistrict: existing.signed_district,
    signedDate: existing.signed_date,
    signatureImage: signatureBuffer,

    gdState: existing.gd_state,
    gdPoliceStation: existing.gd_police_station,
    gdDistrict: existing.gd_district,
    gdNo: existing.gd_no,
    gdDate: existing.gd_date,
    gdType: existing.gd_type,
    gdEntryOfficer: existing.gd_entry_officer,
    gdCaseType: existing.gd_case_type,
    gdBrief: existing.gd_brief,
    gdSubject: existing.gd_subject,
    actsSections: actsSectionsRes.data ?? [],
    gdReportPrintedOn: existing.gd_report_printed_on,
    gdReportPrintedByName: existing.gd_report_printed_by_name,
    gdReportPrintedByRank: existing.gd_report_printed_by_rank,
    gdReportPrintedByNumber: existing.gd_report_printed_by_number,
    signoffs: signoffsRes.data ?? [],
  };

  const pdfBuffer = await generateReportPdf(pdfData);
  const pdfPath = `${user.id}/${existing.id}.pdf`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PDF_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    throw new HttpError(500, `Report data was validated but the PDF could not be stored: ${uploadError.message}`);
  }

  const generatedAt = new Date().toISOString();
  const { data: updatedRaw, error: updateError } = await supabaseAdmin
    .from("reports")
    .update({ status: "submitted", pdf_url: pdfPath, generated_at: generatedAt })
    .eq("id", existing.id)
    .select(REPORT_SELECT_COLUMNS)
    .single();

  if (updateError || !updatedRaw) {
    throw new HttpError(500, updateError?.message ?? "Could not finalize the report submission");
  }
  const updated = updatedRaw as unknown as Record<string, any>;

  if (existing.jansunwai_application_id) {
    await supabaseAdmin
      .from("jansunwai_applications")
      .update({ status: "closed" })
      .eq("id", existing.jansunwai_application_id);
  }

  await logAudit({
    actor: user,
    action: "report.submit",
    targetTable: "reports",
    targetId: existing.id,
    details: { referenceNumber: existing.reference_number },
  });

  res.json(await rowToDetailDto(updated));
});

export const getReportPdfUrl = asyncHandler(async (req: Request, res: Response) => {
  const row = await loadReportOr404(paramId(req));
  assertCanRead(row, req.user!);

  if (!row.pdf_url) {
    throw new HttpError(404, "This report has not generated a PDF yet");
  }

  const url = await signPath(PDF_BUCKET, row.pdf_url);
  if (!url) throw new HttpError(500, "Could not create a download link for this PDF");

  res.json({ url, expiresIn: SIGNED_URL_TTL_SECONDS });
});
