import PDFDocument from "pdfkit";
import path from "path";

// Bundled with the server (see src/assets/fonts/LICENSE.txt — SIL OFL 1.1) so
// Devanagari text renders correctly regardless of what's installed on the host.
const FONT_REGULAR = path.resolve(__dirname, "..", "assets", "fonts", "NotoSansDevanagari-Regular.ttf");
const FONT_BOLD = path.resolve(__dirname, "..", "assets", "fonts", "NotoSansDevanagari-Bold.ttf");

const INK = "#1f2937";
const MUTED = "#4b5563";
const RULE = "#cbd5e1";
const EMPTY = "—";

export interface ReportPdfWitness {
  name?: string | null;
  address?: string | null;
  mobile?: string | null;
  statement?: string | null;
}

export interface ReportPdfActsSection {
  sNo?: number | null;
  act?: string | null;
  section?: string | null;
}

export interface ReportPdfSignoff {
  label?: string | null;
  name?: string | null;
  rank?: string | null;
  number?: string | null;
}

export interface ReportPdfPhoto {
  imageBuffer: Buffer;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ReportPdfData {
  referenceNumber?: string | null;
  addresseeDistrict?: string | null;
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

  disputeCategory?: string | null;
  disputeCategoryNote?: string | null;

  complainantStatement?: string | null;
  oppositePartyStatement?: string | null;

  witnesses: ReportPdfWitness[];

  priorOffenceDetails?: string | null;
  landDisputeTeamDetails?: string | null;
  bondSection126135Details?: string | null;
  priorApplicationDetails?: string | null;

  up112Informed?: boolean | null;
  up112ReportUrl?: string | null;

  section170Details?: string | null;
  courtCaseDetails?: string | null;

  siteVisitDate?: string | null;
  sitePhoto?: ReportPdfPhoto | null;

  priorApplicationChronology?: string | null;

  compromiseDetails?: string | null;
  compromiseAttachmentUrl?: string | null;

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
  signatureImage?: Buffer | null;

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
  actsSections: ReportPdfActsSection[];
  gdReportPrintedOn?: string | null;
  gdReportPrintedByName?: string | null;
  gdReportPrintedByRank?: string | null;
  gdReportPrintedByNumber?: string | null;
  signoffs: ReportPdfSignoff[];
}

function text(value?: string | number | null): string {
  if (value === null || value === undefined) return EMPTY;
  const str = String(value).trim();
  return str.length ? str : EMPTY;
}

function yesNo(value?: boolean | null): string {
  if (value === null || value === undefined) return EMPTY;
  return value ? "हाँ (Yes)" : "नहीं (No)";
}

function formatDate(value?: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return text(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCoord(value?: number | null): string {
  return value === null || value === undefined ? EMPTY : value.toFixed(6);
}

class ReportPdfBuilder {
  doc: PDFKit.PDFDocument;

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
    doc.registerFont("body", FONT_REGULAR);
    doc.registerFont("heading", FONT_BOLD);
  }

  ensureSpace(height: number) {
    const { doc } = this;
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  pageHeading(hindi: string, english?: string) {
    this.ensureSpace(50);
    this.doc.font("heading").fontSize(13).fillColor(INK).text(hindi, { align: "center" });
    if (english) {
      this.doc.font("body").fontSize(9).fillColor(MUTED).text(english, { align: "center" });
    }
    this.doc.moveDown(0.6);
    this.rule();
    this.doc.moveDown(0.6);
  }

  sectionHeading(hindi: string) {
    this.ensureSpace(34);
    this.doc.moveDown(0.3);
    this.doc.font("heading").fontSize(11.5).fillColor(INK).text(hindi);
    this.doc.moveDown(0.3);
    this.rule();
    this.doc.moveDown(0.4);
  }

  rule() {
    const { doc } = this;
    const y = doc.y;
    doc
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .lineWidth(0.6)
      .strokeColor(RULE)
      .stroke();
  }

  /** A single "क्र.सं. N — Hindi label" field with its (possibly long) value below it. */
  numberedField(num: number, label: string, value: string) {
    this.ensureSpace(34);
    this.doc.font("heading").fontSize(10).fillColor(INK).text(`${num}.  ${label}`);
    this.doc.font("body").fontSize(10).fillColor(MUTED).text(value, { indent: 16, lineGap: 1.5 });
    this.doc.moveDown(0.5);
  }

  /** Simple "Label : value" line, used in header blocks and General Diary fields. */
  labelValue(label: string, value: string) {
    this.ensureSpace(20);
    this.doc
      .font("heading")
      .fontSize(10)
      .fillColor(INK)
      .text(`${label}: `, { continued: true })
      .font("body")
      .fillColor(MUTED)
      .text(value);
    this.doc.moveDown(0.15);
  }

  paragraph(label: string, value: string) {
    this.ensureSpace(34);
    this.doc.font("heading").fontSize(10).fillColor(INK).text(`${label}:`);
    this.doc.font("body").fontSize(10).fillColor(MUTED).text(value, { indent: 16, lineGap: 1.5 });
    this.doc.moveDown(0.5);
  }

  table(headers: string[], rows: string[][], columnWidths: number[]) {
    const { doc } = this;
    const startX = doc.page.margins.left;
    const rowHeight = 22;

    const drawRow = (cells: string[], font: "heading" | "body", color: string) => {
      this.ensureSpace(rowHeight + 4);
      let x = startX;
      const rowY = doc.y;
      cells.forEach((cell, i) => {
        doc.font(font).fontSize(9.5).fillColor(color).text(cell, x + 4, rowY + 5, {
          width: columnWidths[i] - 8,
          align: "left",
        });
        x += columnWidths[i];
      });
      doc
        .rect(startX, rowY, columnWidths.reduce((a, b) => a + b, 0), rowHeight)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
      doc.y = rowY + rowHeight;
    };

    drawRow(headers, "heading", INK);
    if (rows.length === 0) {
      drawRow([EMPTY, ...Array(headers.length - 1).fill("")], "body", MUTED);
    } else {
      rows.forEach((row) => drawRow(row, "body", MUTED));
    }
    doc.moveDown(0.6);
  }
}

/**
 * Renders the inquiry report as a PDF buffer mirroring khushbu.pdf's structure:
 * Part A (header + 23 numbered points + photo + signature) then Part B (General Diary).
 * All Hindi labels are kept verbatim from the sample / prompt.md so the generated
 * document reads identically to the department's existing paper format.
 */
export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const b = new ReportPdfBuilder(doc);

    // ---- Header -------------------------------------------------------
    b.pageHeading("जाँच हेतु बिन्दुकृत कार्यवाही का विवरण", "Point-wise Inquiry Report");
    doc.font("body").fontSize(10).fillColor(MUTED).text("सेवा में,", { continued: false });
    doc
      .font("heading")
      .fontSize(10)
      .fillColor(INK)
      .text(
        `श्रीमान वरिष्ठ पुलिस अधीक्षक महोदय, जनपद-${text(data.addresseeDistrict)}`
      );
    doc.moveDown(0.4);
    b.labelValue("सन्दर्भ संख्या (Reference No.)", text(data.referenceNumber));
    b.labelValue("दिनांक (Date)", formatDate(data.reportDate));
    doc.moveDown(0.4);

    // ---- Part A: 23-point inquiry --------------------------------------
    b.sectionHeading("भाग-अ : जाँच आख्या के 23 बिन्दु (Part A — 23-Point Inquiry)");

    b.numberedField(
      1,
      "शिकायतकर्ता का नाम, पता व मो. नम्बर (Complainant's name, address & mobile)",
      [text(data.complainantName), text(data.complainantAddress), text(data.complainantMobile)].join("  |  ")
    );
    b.numberedField(
      2,
      "विपक्षी का नाम, पता व मो. नम्बर (Opposite party's name, address & mobile)",
      [text(data.oppositePartyName), text(data.oppositePartyAddress), text(data.oppositePartyMobile)].join("  |  ")
    );
    b.numberedField(3, "शिकायत/आरोप का संक्षिप्त विवरण (Brief description of complaint)", text(data.complaintDescription));
    b.numberedField(
      4,
      "जाँच अधिकारी का नाम, पद व मो. नम्बर (Investigating Officer — name, designation & mobile)",
      [text(data.ioName), text(data.ioDesignation), text(data.ioMobile)].join("  |  ")
    );
    b.numberedField(5, "FIR का विवरण, यदि दर्ज हो (FIR details, if registered — else निल)", text(data.firDetails));
    b.numberedField(
      6,
      "विवाद की श्रेणी — भूमि/घरेलू/अनाधिकृत कब्जा/अन्य (Category of dispute)",
      [text(data.disputeCategory), text(data.disputeCategoryNote)].filter((v) => v !== EMPTY).join(" — ") || EMPTY
    );
    b.numberedField(7, "आवेदक/शिकायतकर्ता का बयान (Statement of the complainant)", text(data.complainantStatement));
    b.numberedField(8, "विपक्षीगण के बयान (Statement of the opposite party)", text(data.oppositePartyStatement));

    b.ensureSpace(40);
    doc.font("heading").fontSize(10).fillColor(INK).text("9.  स्वतंत्र साक्षीगण के बयान (Statements of independent witnesses)");
    if (data.witnesses.length === 0) {
      doc.font("body").fontSize(10).fillColor(MUTED).text(EMPTY, { indent: 16 });
      doc.moveDown(0.4);
    } else {
      data.witnesses.forEach((w, i) => {
        b.ensureSpace(40);
        doc
          .font("heading")
          .fontSize(9.5)
          .fillColor(INK)
          .text(`${i + 1}. ${text(w.name)} — ${text(w.address)} — ${text(w.mobile)}`, { indent: 16 });
        doc.font("body").fontSize(9.5).fillColor(MUTED).text(text(w.statement), { indent: 28, lineGap: 1.5 });
        doc.moveDown(0.25);
      });
      doc.moveDown(0.25);
    }

    b.numberedField(
      10,
      "क्या इस विवाद से संबंधित कोई पूर्व अपराध हुआ है (Prior related offence, with details)",
      text(data.priorOffenceDetails)
    );
    b.numberedField(
      11,
      "भूमि विवाद की दशा में संयुक्त टीम का विवरण व कार्यवाही का परिणाम (Joint team & site-visit outcome for land disputes)",
      text(data.landDisputeTeamDetails)
    );
    b.numberedField(
      12,
      "धारा 126/135 बीएनएसएस की कार्यवाही में मुचलका धनराशि (Bond amount under BNSS Section 126/135)",
      text(data.bondSection126135Details)
    );
    b.numberedField(
      13,
      "प्रार्थना पत्र पहली बार दिया गया है या पूर्व में दिया जा चुका है (First-time or repeat application — chronology)",
      text(data.priorApplicationDetails)
    );
    b.numberedField(
      14,
      "क्या UP-112 को सूचित किया गया; PRV क्लोजर रिपोर्ट संलग्न (UP-112 informed; PRV closure report attached)",
      `${yesNo(data.up112Informed)}${data.up112ReportUrl ? `  —  संलग्नक: ${data.up112ReportUrl}` : ""}`
    );
    b.numberedField(
      15,
      "धारा 170 बीएनएसएस की कार्यवाही — एकपक्षीय/द्विपक्षीय व मजिस्ट्रेट के समक्ष प्रस्तुति (BNSS Section 170 action details)",
      text(data.section170Details)
    );
    b.numberedField(
      16,
      "माननीय न्यायालय में प्रचलित वाद का विवरण — न्यायालय, वाद सं., स्थिति, अगली तिथि/परिणाम (Pending court case details)",
      text(data.courtCaseDetails)
    );

    b.ensureSpace(34);
    doc
      .font("heading")
      .fontSize(10)
      .fillColor(INK)
      .text("17.  जाँच अधिकारी के मौके पर जाने का दिनांक तथा फोटो (Site-visit date & GPS-tagged photo)");
    doc
      .font("body")
      .fontSize(10)
      .fillColor(MUTED)
      .text(
        `दिनांक (Date): ${formatDate(data.siteVisitDate)}    Latitude: ${formatCoord(
          data.sitePhoto?.latitude
        )}    Longitude: ${formatCoord(data.sitePhoto?.longitude)}`,
        { indent: 16 }
      );
    if (data.sitePhoto?.imageBuffer) {
      try {
        b.ensureSpace(190);
        doc.image(data.sitePhoto.imageBuffer, doc.page.margins.left + 16, doc.y + 4, { fit: [260, 170] });
        doc.y += 178;
        if (data.sitePhoto.caption) {
          doc.font("body").fontSize(9).fillColor(MUTED).text(data.sitePhoto.caption, { indent: 16 });
        }
      } catch {
        doc.font("body").fontSize(9).fillColor(MUTED).text("(फोटो लोड नहीं हो सकी / photo could not be embedded)", { indent: 16 });
      }
    } else {
      doc.font("body").fontSize(9).fillColor(MUTED).text(EMPTY, { indent: 16 });
    }
    doc.moveDown(0.5);

    b.numberedField(
      18,
      "प्रार्थनापत्र पहली बार/पूर्व में — तिथिवार विवरण व परिणाम, क्रमशः (Continuation: chronological record of prior submissions)",
      text(data.priorApplicationChronology)
    );
    b.numberedField(
      19,
      "समझौते का विवरण — संलग्नक, हस्ताक्षर, दिनांक, थाना मुहर व थानाध्यक्ष हस्ताक्षर (Compromise/settlement details)",
      `${text(data.compromiseDetails)}${data.compromiseAttachmentUrl ? `  —  संलग्नक: ${data.compromiseAttachmentUrl}` : ""}`
    );
    b.numberedField(20, "जांच का विश्लेषणात्मक निष्कर्ष एवं संस्तुति (Analytical conclusion & recommendation)", text(data.analyticalConclusion));
    b.numberedField(21, "फीडबैक टिप्पणी / शिकायतकर्ता से वार्ता का सारांश (Feedback / summary of conversation)", text(data.feedbackNotes));
    b.numberedField(
      22,
      "शिकायतकर्ता संतुष्ट है अथवा असंतुष्ट — स्पष्ट विवरण सहित (Complainant satisfaction, with details if dissatisfied)",
      `${yesNo(data.isComplainantSatisfied)}${
        data.isComplainantSatisfied === false && data.dissatisfactionDetails ? `  —  ${data.dissatisfactionDetails}` : ""
      }`
    );
    b.numberedField(23, "कोई अन्य टिप्पणी (Any other comments)", text(data.otherComments));

    // ---- Signature block ------------------------------------------------
    b.ensureSpace(110);
    doc.moveDown(0.4);
    b.rule();
    doc.moveDown(0.6);
    if (data.signatureImage) {
      try {
        doc.image(data.signatureImage, doc.page.margins.left, doc.y, { fit: [140, 60] });
        doc.y += 64;
      } catch {
        /* ignore unembeddable signature image */
      }
    }
    doc.font("heading").fontSize(10).fillColor(INK).text(text(data.signedName));
    doc
      .font("body")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        `${text(data.signedDesignation)}   |   थाना ${text(data.signedPoliceStation)}   |   जनपद ${text(
          data.signedDistrict
        )}   |   दिनांक ${formatDate(data.signedDate)}`
      );

    // ---- Part B: General Diary ------------------------------------------
    doc.addPage();
    b.pageHeading("सामान्य डायरी विवरण", "Part B — General Diary (G.D.) Details");

    b.labelValue("राज्य (State)", text(data.gdState));
    b.labelValue("थाना (Police Station)", text(data.gdPoliceStation));
    b.labelValue("जिला (District)", text(data.gdDistrict));
    doc.moveDown(0.3);
    b.labelValue("रोजनामचा सं. (G.D. No.)", text(data.gdNo));
    b.labelValue("रोजनामचा दिनांक (G.D. Date)", formatDate(data.gdDate));
    b.labelValue("रोजनामचा प्रकार (G.D. Type)", text(data.gdType));
    b.labelValue("प्रविष्टि अधिकारी (Entry Officer)", text(data.gdEntryOfficer));
    b.labelValue("प्रकरण के प्रकार (Case Type)", text(data.gdCaseType));
    doc.moveDown(0.3);
    b.labelValue("विषय (Subject)", text(data.gdSubject));
    b.paragraph("रोजनामचा संक्षिप्त विवरण (G.D. Brief)", text(data.gdBrief));

    b.sectionHeading("अधिनियम और धारा (Acts & Sections)");
    b.table(
      ["क्र.सं. (S.No.)", "अधिनियम (Act)", "धारा (Section)"],
      data.actsSections.map((row, i) => [text(row.sNo ?? i + 1), text(row.act), text(row.section)]),
      [90, 250, 160]
    );

    b.labelValue("Report Printed On", formatDate(data.gdReportPrintedOn));
    b.labelValue(
      "Report Printed By",
      [text(data.gdReportPrintedByName), text(data.gdReportPrintedByRank), text(data.gdReportPrintedByNumber)].join("  |  ")
    );

    b.sectionHeading("हस्ताक्षर (Sign-off)");
    b.table(
      ["विवरण (Label)", "नाम (Name)", "पद (Rank)", "सं. (Number)"],
      data.signoffs.map((row) => [text(row.label), text(row.name), text(row.rank), text(row.number)]),
      [110, 160, 110, 110]
    );

    doc.end();
  });
}
