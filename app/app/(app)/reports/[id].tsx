import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, View } from "react-native";
import { Text } from "../../../components/Text";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { FormField } from "../../../components/FormField";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { Banner } from "../../../components/Banner";
import { ChipSelect } from "../../../components/ChipSelect";
import { apiRequest, ApiError } from "../../../lib/api";
import { pickAndUploadReportFile } from "../../../lib/reportFiles";
import type {
  ReportActsSection,
  ReportDetail,
  ReportSignoff,
  ReportUpdateInput,
  ReportWitness,
} from "../../../types/report";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pdf_generated: "PDF generated",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  submitted: "bg-emerald-100 text-emerald-800",
  pdf_generated: "bg-emerald-100 text-emerald-800",
};

const DISPUTE_CATEGORY_OPTIONS = [
  { value: "land", label: "भूमि विवाद (Land)" },
  { value: "domestic", label: "घरेलू (Domestic)" },
  { value: "illegal_possession", label: "अनाधिकृत कब्जा (Illegal possession)" },
  { value: "other", label: "अन्य (Other)" },
] as const;

const YES_NO_OPTIONS = [
  { value: "yes", label: "हाँ (Yes)" },
  { value: "no", label: "नहीं (No)" },
] as const;

function SectionHeading({ number, hindi, english }: { number?: number; hindi: string; english?: string }) {
  return (
    <View className="mb-3 mt-6 border-b border-slate-200 pb-2">
      <Text className="text-base font-bold text-slate-900">
        {number ? `${number}. ` : ""}
        {hindi}
      </Text>
      {english ? <Text className="text-xs text-slate-500">{english}</Text> : null}
    </View>
  );
}

function FilePreviewRow({
  label,
  previewUrl,
  onPick,
  onClear,
  busy,
  disabled,
}: {
  label: string;
  previewUrl?: string | null;
  onPick: () => void;
  onClear?: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <View className="mb-4 w-full rounded-lg border border-slate-200 bg-white p-3">
      <Text className="mb-2 text-sm font-medium text-slate-700">{label}</Text>
      {previewUrl ? (
        <Image source={{ uri: previewUrl }} className="mb-2 h-32 w-full rounded-md bg-slate-100" resizeMode="contain" />
      ) : (
        <Text className="mb-2 text-xs text-slate-400">No file uploaded yet.</Text>
      )}
      <View className="flex-row gap-2">
        <Pressable
          onPress={onPick}
          disabled={disabled || busy}
          className={`flex-1 items-center rounded-lg border border-brand-600 px-3 py-2 ${disabled || busy ? "opacity-50" : "active:bg-brand-50"}`}
        >
          {busy ? (
            <ActivityIndicator color="#1d4ed8" size="small" />
          ) : (
            <Text className="text-sm font-semibold text-brand-600">{previewUrl ? "Replace file" : "Upload file"}</Text>
          )}
        </Pressable>
        {previewUrl && onClear ? (
          <Pressable onPress={onClear} disabled={disabled} className="items-center rounded-lg border border-slate-300 px-3 py-2">
            <Text className="text-sm font-medium text-slate-500">Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState<ReportUpdateInput>({});
  const [witnesses, setWitnesses] = useState<ReportWitness[]>([]);
  const [actsSections, setActsSections] = useState<ReportActsSection[]>([]);
  const [signoffs, setSignoffs] = useState<ReportSignoff[]>([]);

  const isDraft = report?.status === "draft";

  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<ReportDetail>(`/reports/${id}`);
      setReport(data);
      setForm(data);
      setWitnesses(data.witnesses ?? []);
      setActsSections(data.actsSections ?? []);
      setSignoffs(data.signoffs ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function set<K extends keyof ReportUpdateInput>(key: K, value: ReportUpdateInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function bind(key: keyof ReportUpdateInput) {
    return {
      value: (form[key] as string | undefined) ?? "",
      onChangeText: (text: string) => set(key, (text as unknown) as ReportUpdateInput[typeof key]),
    };
  }

  async function handleSave() {
    if (!report) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const payload: ReportUpdateInput = { ...form, witnesses, actsSections, signoffs };
      const updated = await apiRequest<ReportDetail>(`/reports/${report.id}`, { method: "PATCH", body: payload });
      setReport(updated);
      setForm(updated);
      setWitnesses(updated.witnesses ?? []);
      setActsSections(updated.actsSections ?? []);
      setSignoffs(updated.signoffs ?? []);
      setSuccess("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!report) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      // Persist any unsaved edits first so the generated PDF reflects the latest form state.
      const payload: ReportUpdateInput = { ...form, witnesses, actsSections, signoffs };
      await apiRequest<ReportDetail>(`/reports/${report.id}`, { method: "PATCH", body: payload });
      const submitted = await apiRequest<ReportDetail>(`/reports/${report.id}/submit`, { method: "POST" });
      setReport(submitted);
      setForm(submitted);
      setSuccess("Report submitted and PDF generated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit this report.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadPdf() {
    if (!report) return;
    setError("");
    setDownloadingPdf(true);
    try {
      const { url } = await apiRequest<{ url: string }>(`/reports/${report.id}/pdf-url`);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the generated PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleUpload(kind: Parameters<typeof pickAndUploadReportFile>[1], options?: { useLocation?: boolean; source?: "image" | "document" }) {
    if (!report) return;
    setError("");
    setSuccess("");
    setUploadingKind(kind);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (options?.useLocation) {
        setLocating(true);
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.granted) {
            const position = await Location.getCurrentPositionAsync({});
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
          }
        } finally {
          setLocating(false);
        }
      }

      const result = await pickAndUploadReportFile(report.id, kind, { latitude, longitude, source: options?.source });
      if (!result) return;

      await loadReport();
      setSuccess("File uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploadingKind(null);
    }
  }

  // ---- Repeatable group helpers --------------------------------------------
  function addWitness() {
    setWitnesses((prev) => [...prev, { name: "", address: "", mobile: "", statement: "" }]);
  }
  function updateWitness(index: number, patch: Partial<ReportWitness>) {
    setWitnesses((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }
  function removeWitness(index: number) {
    setWitnesses((prev) => prev.filter((_, i) => i !== index));
  }

  function addActsSection() {
    setActsSections((prev) => [...prev, { sNo: prev.length + 1, act: "", section: "" }]);
  }
  function updateActsSection(index: number, patch: Partial<ReportActsSection>) {
    setActsSections((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function removeActsSection(index: number) {
    setActsSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addSignoff() {
    setSignoffs((prev) => [...prev, { label: "", name: "", rank: "", number: "" }]);
  }
  function updateSignoff(index: number, patch: Partial<ReportSignoff>) {
    setSignoffs((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeSignoff(index: number) {
    setSignoffs((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <ScreenContainer title="Inquiry Report">
        <ActivityIndicator color="#1d4ed8" />
      </ScreenContainer>
    );
  }

  if (!report) {
    return (
      <ScreenContainer title="Inquiry Report">
        <Banner message={error || "This report could not be found."} variant="error" />
        <PrimaryButton label="Back to reports" onPress={() => router.replace("/(app)/reports")} variant="outline" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title={report.referenceNumber || "New Inquiry Report"}
      subtitle="जाँच हेतु बिन्दुकृत कार्यवाही का विवरण — भाग-अ व भाग-ब"
    >
      <View className="mb-4 flex-row items-center justify-between">
        <View className={`self-start rounded-full px-3 py-1 ${STATUS_STYLES[report.status] ?? "bg-slate-100 text-slate-700"}`}>
          <Text className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABELS[report.status] ?? report.status}</Text>
        </View>
        <Pressable onPress={() => router.replace("/(app)/reports")}>
          <Text className="text-sm font-semibold text-brand-600">All reports</Text>
        </Pressable>
      </View>

      <Banner message={error} variant="error" />
      <Banner message={success} variant="success" />

      {!isDraft ? (
        <Banner
          variant="info"
          message="This report has been submitted and is now read-only. Its generated PDF reflects the data at the time of submission."
        />
      ) : null}

      {report.pdfDownloadUrl ? (
        <PrimaryButton label={downloadingPdf ? "Opening…" : "Download generated PDF"} onPress={handleDownloadPdf} loading={downloadingPdf} variant="outline" icon="picture-as-pdf" />
      ) : null}

      {/* ---- Header ---------------------------------------------------- */}
      <SectionHeading hindi="सन्दर्भ विवरण" english="Header — addressee, reference number & date" />
      <FormField label="जनपद / जिसे संबोधित (Addressee district)" editable={isDraft} {...bind("addresseeDistrict")} />
      <FormField label="सन्दर्भ संख्या (Reference number)" editable={isDraft} {...bind("referenceNumber")} />
      <FormField label="दिनांक — YYYY-MM-DD (Report date)" editable={isDraft} placeholder="2026-06-08" {...bind("reportDate")} />

      {/* ---- Point 1 --------------------------------------------------- */}
      <SectionHeading number={1} hindi="शिकायतकर्ता का विवरण" english="Complainant's name, address & mobile" />
      <FormField label="नाम (Name)" editable={isDraft} {...bind("complainantName")} />
      <FormField label="पता (Address)" editable={isDraft} multiline numberOfLines={2} {...bind("complainantAddress")} />
      <FormField label="मोबाइल नंबर (Mobile)" editable={isDraft} keyboardType="phone-pad" {...bind("complainantMobile")} />

      {/* ---- Point 2 --------------------------------------------------- */}
      <SectionHeading number={2} hindi="विपक्षी का विवरण" english="Opposite party's name, address & mobile" />
      <FormField label="नाम (Name)" editable={isDraft} {...bind("oppositePartyName")} />
      <FormField label="पता (Address)" editable={isDraft} multiline numberOfLines={2} {...bind("oppositePartyAddress")} />
      <FormField label="मोबाइल नंबर (Mobile)" editable={isDraft} keyboardType="phone-pad" {...bind("oppositePartyMobile")} />

      {/* ---- Point 3 --------------------------------------------------- */}
      <SectionHeading number={3} hindi="शिकायत/आरोप का संक्षिप्त विवरण" english="Brief description of the complaint" />
      <FormField label="विवरण (Description)" editable={isDraft} multiline numberOfLines={4} {...bind("complaintDescription")} />

      {/* ---- Point 4 --------------------------------------------------- */}
      <SectionHeading number={4} hindi="जाँच अधिकारी का विवरण" english="Investigating Officer — name, designation & mobile" />
      <FormField label="नाम (Name)" editable={isDraft} {...bind("ioName")} />
      <FormField label="पद (Designation)" editable={isDraft} {...bind("ioDesignation")} />
      <FormField label="मोबाइल नंबर (Mobile)" editable={isDraft} keyboardType="phone-pad" {...bind("ioMobile")} />

      {/* ---- Point 5 --------------------------------------------------- */}
      <SectionHeading number={5} hindi="FIR का विवरण" english="FIR details, if registered — otherwise लिखें 'निल'" />
      <FormField label="FIR विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("firDetails")} />

      {/* ---- Point 6 --------------------------------------------------- */}
      <SectionHeading number={6} hindi="विवाद की श्रेणी" english="Category of dispute" />
      <ChipSelect
        label="श्रेणी चुनें (Choose category)"
        value={form.disputeCategory ?? null}
        options={DISPUTE_CATEGORY_OPTIONS}
        onChange={(value) => isDraft && set("disputeCategory", value)}
      />
      <FormField label="अतिरिक्त टिप्पणी (Additional note)" editable={isDraft} multiline numberOfLines={2} {...bind("disputeCategoryNote")} />

      {/* ---- Point 7 & 8 ------------------------------------------------ */}
      <SectionHeading number={7} hindi="आवेदक/शिकायतकर्ता का बयान" english="Statement of the complainant" />
      <FormField label="बयान (Statement)" editable={isDraft} multiline numberOfLines={4} {...bind("complainantStatement")} />

      <SectionHeading number={8} hindi="विपक्षीगण के बयान" english="Statement of the opposite party" />
      <FormField label="बयान (Statement)" editable={isDraft} multiline numberOfLines={4} {...bind("oppositePartyStatement")} />

      {/* ---- Point 9: witnesses ---------------------------------------- */}
      <SectionHeading number={9} hindi="स्वतंत्र साक्षीगण के बयान" english="Statements of independent witnesses" />
      {witnesses.map((witness, index) => (
        <View key={index} className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-700">साक्षी {index + 1}</Text>
            {isDraft ? (
              <Pressable onPress={() => removeWitness(index)}>
                <Text className="text-xs font-semibold text-red-600">Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <FormField label="नाम (Name)" editable={isDraft} value={witness.name ?? ""} onChangeText={(t) => updateWitness(index, { name: t })} />
          <FormField label="पता (Address)" editable={isDraft} value={witness.address ?? ""} onChangeText={(t) => updateWitness(index, { address: t })} />
          <FormField label="मोबाइल (Mobile)" editable={isDraft} keyboardType="phone-pad" value={witness.mobile ?? ""} onChangeText={(t) => updateWitness(index, { mobile: t })} />
          <FormField
            label="बयान (Statement)"
            editable={isDraft}
            multiline
            numberOfLines={3}
            value={witness.statement ?? ""}
            onChangeText={(t) => updateWitness(index, { statement: t })}
          />
        </View>
      ))}
      {isDraft ? <PrimaryButton label="+ Add witness" onPress={addWitness} variant="outline" /> : null}

      {/* ---- Point 10-13 ------------------------------------------------ */}
      <SectionHeading number={10} hindi="पूर्व अपराध का विवरण" english="Prior related offence, with details" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("priorOffenceDetails")} />

      <SectionHeading number={11} hindi="संयुक्त टीम / भूमि विवाद स्थलीय निरीक्षण" english="Joint team & site-visit outcome for land disputes" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("landDisputeTeamDetails")} />

      <SectionHeading number={12} hindi="धारा 126/135 बीएनएसएस — मुचलका धनराशि" english="Bond amount under BNSS Section 126/135" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={2} {...bind("bondSection126135Details")} />

      <SectionHeading number={13} hindi="प्रार्थना पत्र की पूर्व स्थिति" english="First-time or repeat application — chronology" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("priorApplicationDetails")} />

      {/* ---- Point 14 --------------------------------------------------- */}
      <SectionHeading number={14} hindi="UP-112 सूचना व PRV क्लोजर रिपोर्ट" english="UP-112 informed; PRV closure report attached" />
      <ChipSelect
        label="क्या UP-112 को सूचित किया गया?"
        value={form.up112Informed === true ? "yes" : form.up112Informed === false ? "no" : null}
        options={YES_NO_OPTIONS}
        onChange={(value) => isDraft && set("up112Informed", value === "yes")}
      />
      <FilePreviewRow
        label="PRV क्लोजर रिपोर्ट संलग्नक (Closure report attachment)"
        previewUrl={report.up112ReportPreviewUrl}
        onPick={() => handleUpload("up112_report", { source: "document" })}
        busy={uploadingKind === "up112_report"}
        disabled={!isDraft}
      />

      <SectionHeading number={15} hindi="धारा 170 बीएनएसएस की कार्यवाही" english="Action under BNSS Section 170 (ex-parte / both parties; magistrate presentation)" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("section170Details")} />

      <SectionHeading number={16} hindi="माननीय न्यायालय में प्रचलित वाद" english="Pending court case — court, case no., status, next date / outcome" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("courtCaseDetails")} />

      {/* ---- Point 17: site visit --------------------------------------- */}
      <SectionHeading number={17} hindi="मौके पर जाने का दिनांक तथा फोटो" english="Site-visit date & GPS-tagged photo" />
      <FormField label="दिनांक — YYYY-MM-DD (Visit date)" editable={isDraft} placeholder="2026-06-08" {...bind("siteVisitDate")} />
      <View className="mb-2 flex-row gap-3">
        <View className="flex-1">
          <FormField label="Latitude" editable={isDraft} keyboardType="numeric" {...bind("siteVisitLatitude")} />
        </View>
        <View className="flex-1">
          <FormField label="Longitude" editable={isDraft} keyboardType="numeric" {...bind("siteVisitLongitude")} />
        </View>
      </View>
      <FilePreviewRow
        label="साइट फोटो (Site-visit photo — captures current GPS location automatically)"
        previewUrl={report.siteVisitPhotoPreviewUrl}
        onPick={() => handleUpload("site_photo", { useLocation: true, source: "image" })}
        busy={uploadingKind === "site_photo" || locating}
        disabled={!isDraft}
      />

      <SectionHeading number={18} hindi="प्रार्थनापत्र की तिथिवार कालक्रम" english="Continuation: chronological record of prior submissions" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("priorApplicationChronology")} />

      {/* ---- Point 19 --------------------------------------------------- */}
      <SectionHeading number={19} hindi="समझौते का विवरण" english="Compromise / settlement — attachment, signatures, date, station seal" />
      <FormField label="विवरण" editable={isDraft} multiline numberOfLines={3} {...bind("compromiseDetails")} />
      <FilePreviewRow
        label="समझौता संलग्नक (Compromise document)"
        previewUrl={report.compromiseAttachmentPreviewUrl}
        onPick={() => handleUpload("compromise_document", { source: "document" })}
        busy={uploadingKind === "compromise_document"}
        disabled={!isDraft}
      />

      {/* ---- Point 20-23 ------------------------------------------------ */}
      <SectionHeading number={20} hindi="विश्लेषणात्मक निष्कर्ष एवं संस्तुति" english="Analytical conclusion & recommendation" />
      <FormField label="निष्कर्ष" editable={isDraft} multiline numberOfLines={4} {...bind("analyticalConclusion")} />

      <SectionHeading number={21} hindi="फीडबैक टिप्पणी" english="Feedback / summary of conversation with the complainant" />
      <FormField label="टिप्पणी" editable={isDraft} multiline numberOfLines={3} {...bind("feedbackNotes")} />

      <SectionHeading number={22} hindi="शिकायतकर्ता संतुष्ट है अथवा असंतुष्ट" english="Complainant satisfaction — with details if dissatisfied" />
      <ChipSelect
        label="क्या शिकायतकर्ता संतुष्ट है?"
        value={form.isComplainantSatisfied === true ? "yes" : form.isComplainantSatisfied === false ? "no" : null}
        options={YES_NO_OPTIONS}
        onChange={(value) => isDraft && set("isComplainantSatisfied", value === "yes")}
      />
      {form.isComplainantSatisfied === false ? (
        <FormField label="असंतुष्टि का विवरण (Dissatisfaction details)" editable={isDraft} multiline numberOfLines={3} {...bind("dissatisfactionDetails")} />
      ) : null}

      <SectionHeading number={23} hindi="कोई अन्य टिप्पणी" english="Any other comments" />
      <FormField label="टिप्पणी" editable={isDraft} multiline numberOfLines={3} {...bind("otherComments")} />

      {/* ---- Signature block -------------------------------------------- */}
      <SectionHeading hindi="हस्ताक्षर विवरण" english="Signing officer & signature" />
      <FormField label="नाम (Name)" editable={isDraft} {...bind("signedName")} />
      <FormField label="पद (Designation)" editable={isDraft} {...bind("signedDesignation")} />
      <FormField label="थाना (Police Station)" editable={isDraft} {...bind("signedPoliceStation")} />
      <FormField label="जनपद (District)" editable={isDraft} {...bind("signedDistrict")} />
      <FormField label="दिनांक — YYYY-MM-DD" editable={isDraft} placeholder="2026-06-08" {...bind("signedDate")} />
      <FilePreviewRow
        label="हस्ताक्षर छवि (Signature image)"
        previewUrl={report.signaturePreviewUrl}
        onPick={() => handleUpload("signature", { source: "image" })}
        busy={uploadingKind === "signature"}
        disabled={!isDraft}
      />

      {/* ---- Part B: General Diary -------------------------------------- */}
      <SectionHeading hindi="भाग-ब : सामान्य डायरी विवरण" english="Part B — General Diary (G.D.) details" />
      <FormField label="राज्य (State)" editable={isDraft} {...bind("gdState")} />
      <FormField label="थाना (Police Station)" editable={isDraft} {...bind("gdPoliceStation")} />
      <FormField label="जिला (District)" editable={isDraft} {...bind("gdDistrict")} />
      <FormField label="रोजनामचा सं. (G.D. No.)" editable={isDraft} {...bind("gdNo")} />
      <FormField label="रोजनामचा दिनांक — YYYY-MM-DD" editable={isDraft} placeholder="2026-06-08" {...bind("gdDate")} />
      <FormField label="रोजनामचा प्रकार (G.D. Type)" editable={isDraft} {...bind("gdType")} />
      <FormField label="प्रविष्टि अधिकारी (Entry Officer)" editable={isDraft} {...bind("gdEntryOfficer")} />
      <FormField label="प्रकरण के प्रकार (Case Type)" editable={isDraft} {...bind("gdCaseType")} />
      <FormField label="विषय (Subject)" editable={isDraft} {...bind("gdSubject")} />
      <FormField label="संक्षिप्त विवरण (Brief)" editable={isDraft} multiline numberOfLines={3} {...bind("gdBrief")} />

      {/* Acts & Sections */}
      <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">अधिनियम और धारा (Acts & Sections)</Text>
      {actsSections.map((row, index) => (
        <View key={index} className="mb-3 flex-row items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <View className="w-16">
            <FormField
              label="क्र.सं."
              editable={isDraft}
              keyboardType="numeric"
              value={row.sNo != null ? String(row.sNo) : ""}
              onChangeText={(t) => updateActsSection(index, { sNo: t ? Number(t) : null })}
            />
          </View>
          <View className="flex-1">
            <FormField label="अधिनियम (Act)" editable={isDraft} value={row.act ?? ""} onChangeText={(t) => updateActsSection(index, { act: t })} />
          </View>
          <View className="flex-1">
            <FormField label="धारा (Section)" editable={isDraft} value={row.section ?? ""} onChangeText={(t) => updateActsSection(index, { section: t })} />
          </View>
          {isDraft ? (
            <Pressable onPress={() => removeActsSection(index)} className="mb-4 px-2">
              <Text className="text-xs font-semibold text-red-600">Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {isDraft ? <PrimaryButton label="+ Add act / section row" onPress={addActsSection} variant="outline" /> : null}

      <FormField label="Report Printed On — YYYY-MM-DD" editable={isDraft} placeholder="2026-06-08" {...bind("gdReportPrintedOn")} />
      <FormField label="Printed By — Name" editable={isDraft} {...bind("gdReportPrintedByName")} />
      <FormField label="Printed By — Rank" editable={isDraft} {...bind("gdReportPrintedByRank")} />
      <FormField label="Printed By — Number" editable={isDraft} {...bind("gdReportPrintedByNumber")} />

      {/* Sign-offs */}
      <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">हस्ताक्षर (Sign-off blocks)</Text>
      {signoffs.map((row, index) => (
        <View key={index} className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-700">हस्ताक्षर {index + 1}</Text>
            {isDraft ? (
              <Pressable onPress={() => removeSignoff(index)}>
                <Text className="text-xs font-semibold text-red-600">Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <FormField label="विवरण (Label)" editable={isDraft} value={row.label ?? ""} onChangeText={(t) => updateSignoff(index, { label: t })} />
          <FormField label="नाम (Name)" editable={isDraft} value={row.name ?? ""} onChangeText={(t) => updateSignoff(index, { name: t })} />
          <FormField label="पद (Rank)" editable={isDraft} value={row.rank ?? ""} onChangeText={(t) => updateSignoff(index, { rank: t })} />
          <FormField label="संख्या (Number)" editable={isDraft} value={row.number ?? ""} onChangeText={(t) => updateSignoff(index, { number: t })} />
        </View>
      ))}
      {isDraft ? <PrimaryButton label="+ Add sign-off" onPress={addSignoff} variant="outline" /> : null}

      {/* ---- Actions ----------------------------------------------------- */}
      {isDraft ? (
        <View className="mt-8 gap-3">
          <PrimaryButton label="Save draft" onPress={handleSave} loading={saving} variant="outline" icon="save" />
          <PrimaryButton label="Submit & generate PDF" onPress={handleSubmit} loading={submitting} icon="picture-as-pdf" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
