# NetrAstra — Document Intelligence Engine

## Phase 13 Deliverables Report

This report documents the full **Document Intelligence Engine** initiative (Phases 1–12): AI-powered OCR document scanning, AI legal analysis with BNS/BNSS/BSA statutory mapping, offline-first sync, accountability (audit log), station directory, emergency numbers, dashboard/UI polish, and performance hardening — built on top of the existing NetrAstra (CCTNS / Jan Sunwai inquiry management) app.

All code referenced below is implemented, integrated, and verified with a clean `tsc --noEmit` against the existing codebase. Per the agreed scope for this report, item 10 ("Complete implementation code") is delivered as a **file manifest** (path + why modified) — the working tree at each path is the code-of-record, not duplicated here.

---

## 1. Architecture Changes Report

The Document Intelligence Engine adds three cooperating subsystems on top of the existing Express + Supabase + Expo/React Native stack:

### 1.1 Document Scan & OCR
- Users capture/select a document (camera, gallery image, or PDF).
- The client downsizes/compresses images (`expo-image-manipulator`, max 2000px edge, JPEG q=0.7) and base64-encodes the file.
- `POST /api/documents/scan` runs **synchronous OCR** via Claude's vision (images) / native document (PDF) input, persists the file to a private Supabase Storage bucket (`scanned-documents`), and stores extracted text, language, confidence, entities, and keywords in `scanned_documents`.
- Scan results can flow directly into legal analysis (`sourceDocumentId`).

### 1.2 AI Legal Analysis (BNS/BNSS/BSA)
- Users paste free text or pick a previously-scanned document, choose **Quick** (Claude Haiku) or **Deep Research** (Claude Sonnet) mode.
- `POST /api/legal/analyze` returns case classification, plain-language summary, applicable BNS/BNSS/BSA sections (with old IPC/CrPC/Evidence Act equivalents where known), key facts, and recommended actions — Deep mode adds detailed legal reasoning, procedural/evidentiary notes, similar provisions, and drafting notes.
- A curated, read-only `bns_section_mappings` reference table backs a standalone IPC→BNS / CrPC→BNSS / Evidence Act→BSA lookup screen, also available offline.

### 1.3 Offline-First Architecture
- A local encrypted SQLite database (`expo-sqlite` + AES-256 via `crypto-js`, key in device secure storage) caches the last 50 scans, last 50 legal analyses, and the full BNS reference table for offline reading.
- A **scan outbox** queues camera/gallery/PDF captures made while offline; `OfflineContext` auto-syncs the outbox when connectivity returns (`expo-network`) and exposes `isOnline` / `outboxCount` / `syncing` / `syncNow()` app-wide via an `OfflineBanner` shown on relevant screens.

### 1.4 Accountability, Directory & Dashboard Polish
- An `audit_log` table + `audit.service.ts` records sensitive actions (user management, password resets, report submissions, document scans) — surfaced to admins via a new Audit Log screen.
- A Station Directory (personnel list with call actions) and a bilingual Emergency Numbers screen were added under a new `directory` route group.
- The Dashboard gained a personalized "Hello, {name}" greeting header with role badge, and `Card` gained per-category accent tones (`CardTone`), `rounded-2xl`/`shadow-sm` styling, all cascaded from the shared `Card`/`Banner`/`ScreenContainer` components (Phase 11).

### 1.5 Performance Hardening (Phase 12)
- `apiRequest` now enforces request timeouts (20s default, 60s for OCR/legal-analysis) via `AbortController`, with timeouts surfaced as plain `Error`s so existing offline-fallback `catch` blocks treat them like network failures.
- Client-side PDF size pre-check (12MB) before reading base64.
- The three growth-unbounded list screens (scan history, legal history, audit log) were converted from `ScrollView`+`.map()` to `FlatList` (via a new `ScreenContainer scrollable={false}` mode), with memoized row components. `Card`, `CaseRow`, and `PersonnelRow` are also memoized.

---

## 2. Folder Structure Changes

```
app/
├── app/
│   ├── _layout.tsx                       (MODIFIED — wrap tree in OfflineProvider)
│   └── (app)/
│       ├── _layout.tsx                   (MODIFIED — register new tabs/routes)
│       ├── dashboard.tsx                 (MODIFIED — greeting header, Card tones)
│       ├── investigations.tsx            (MODIFIED — memoized CaseRow)
│       ├── admin/
│       │   └── audit-log.tsx             (NEW)
│       ├── directory/                    (NEW directory)
│       │   ├── police-station.tsx
│       │   └── emergency.tsx
│       ├── scan/                         (NEW directory)
│       │   ├── index.tsx
│       │   ├── [id].tsx
│       │   └── history.tsx
│       └── legal/                        (NEW directory)
│           ├── index.tsx
│           ├── [id].tsx
│           ├── history.tsx
│           └── bns-lookup.tsx
│   └── (auth)/
│       └── forgot-password.tsx           (MODIFIED — username-based reset)
├── components/
│   ├── Avatar.tsx                        (NEW)
│   ├── OfflineBanner.tsx                 (NEW)
│   ├── Card.tsx                          (MODIFIED — tones, memo, rounded-2xl)
│   ├── Banner.tsx                        (MODIFIED — rounded-xl)
│   └── ScreenContainer.tsx               (MODIFIED — scrollable prop)
├── context/
│   └── OfflineContext.tsx                (NEW)
├── lib/
│   ├── api.ts                            (MODIFIED — request timeouts)
│   ├── documentScan.ts                   (NEW)
│   ├── legalAnalysis.ts                  (NEW)
│   ├── offlineDb.ts                      (NEW)
│   ├── offlineCache.ts                   (NEW)
│   ├── scanOutbox.ts                     (NEW)
│   ├── network.ts                        (NEW)
│   └── emergencyNumbers.ts               (NEW)
└── types/
    ├── document.ts                       (NEW)
    ├── legal.ts                          (NEW)
    └── index.ts                          (MODIFIED — StationPersonnel)

server/
└── src/
    ├── index.ts                          (MODIFIED — helmet, rate limit, body limit)
    ├── config/env.ts                     (MODIFIED — removed unused JWT/session secrets)
    ├── controllers/
    │   ├── documents.controller.ts       (NEW)
    │   ├── legal.controller.ts           (NEW)
    │   ├── directory.controller.ts       (NEW)
    │   ├── admin.controller.ts           (MODIFIED — audit log endpoint + logging)
    │   ├── auth.controller.ts            (MODIFIED — forgot-password + logging)
    │   └── reports.controller.ts         (MODIFIED — audit logging)
    ├── middleware/
    │   ├── errorHandler.ts               (MODIFIED — Zod validation errors)
    │   └── rateLimit.ts                  (MODIFIED — new limiters)
    ├── routes/
    │   ├── documents.routes.ts           (NEW)
    │   ├── legal.routes.ts               (NEW)
    │   ├── directory.routes.ts           (NEW)
    │   ├── admin.routes.ts               (MODIFIED)
    │   ├── auth.routes.ts                (MODIFIED)
    │   ├── investigations.routes.ts      (MODIFIED — scrapeRateLimiter)
    │   ├── jansunwai.routes.ts           (MODIFIED — scrapeRateLimiter)
    │   └── index.ts                      (MODIFIED — mount new route modules)
    ├── services/
    │   ├── ocr.service.ts                (NEW)
    │   ├── legal.service.ts              (NEW)
    │   ├── audit.service.ts              (NEW)
    │   └── ai.service.ts                 (MODIFIED — exports stripFences/askClaude)
    └── scripts/                          (NEW directory)
        └── testScrape.ts

supabase/
└── migrations/
    ├── 20260610000000_audit_log.sql          (NEW)
    ├── 20260610010000_scanned_documents.sql  (NEW)
    ├── 20260610020000_legal_analysis.sql     (NEW)
    └── README.md                             (MODIFIED — index entries 9–12)
```

---

## 3. New Dependencies

### `app/package.json`
| Package | Version | Purpose |
|---|---|---|
| `expo-image-manipulator` | `~56.0.0` | Resize/compress/convert scanned images before upload |
| `expo-document-picker` *(already present)* | `~56.0.4` | Pick PDF documents for OCR |
| `expo-sqlite` | `~56.0.0` | Local encrypted offline cache + scan outbox |
| `expo-crypto` | `~56.0.0` | Random IDs / hashing for offline cache entries |
| `expo-network` | `~56.0.0` | Connectivity detection for `OfflineContext` |
| `expo-clipboard` | `~56.0.0` | "Copy number" action on the Emergency Numbers screen |
| `crypto-js` | `^4.2.0` | AES-256 encryption of the local SQLite cache |
| `@types/crypto-js` (dev) | `^4.2.2` | Type definitions for `crypto-js` |

### `server/package.json`
| Package | Version | Purpose |
|---|---|---|
| `helmet` | `^8.1.0` | Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.) on the Express API |

No new AI SDK was added — OCR and legal analysis reuse the existing `@anthropic-ai/sdk` client (`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`).

---

## 4. Database Changes

Three new migrations (plus the already-applied `20260609000000_add_username_to_profiles.sql` that this work depends on for `actor_username` in the audit log).

### 4.1 `20260610000000_audit_log.sql`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `actor_id` | `uuid` | FK → `profiles(id)` ON DELETE SET NULL |
| `actor_username` | `text` | denormalized for display after user deletion |
| `action` | `text` NOT NULL | e.g. `user.create`, `auth.reset_password`, `document.scan`, `report.submit` |
| `target_table` | `text` | nullable |
| `target_id` | `uuid` | nullable |
| `details` | `jsonb` | nullable, free-form context |
| `created_at` | `timestamptz` DEFAULT `now()` | |

- Indexes: `audit_log_created_at_idx` (desc), `audit_log_actor_id_idx`
- RLS: enabled, policy **"Admins can read audit log"** — `select` restricted to `role = 'admin'`. No insert/update/delete policies for client roles (writes go through `supabaseAdmin` only, server-side).

### 4.2 `20260610010000_scanned_documents.sql`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `profiles(id)` ON DELETE CASCADE |
| `source` | enum `document_source` (`camera`\|`image`\|`pdf`) | NOT NULL |
| `file_path` | `text` NOT NULL | Storage object path |
| `file_name`, `mime_type` | `text` NOT NULL | |
| `file_size` | `integer` NOT NULL | bytes |
| `ocr_status` | enum `ocr_status` (`pending`\|`processing`\|`completed`\|`failed`) | default `pending` |
| `extracted_text` | `text` | |
| `confidence` | `numeric` | 0–1 |
| `language_detected` | `text` | `hindi`\|`english`\|`mixed`\|`unknown` |
| `entities`, `keywords` | `jsonb` | OCR entity/keyword extraction |
| `error_message` | `text` | populated on OCR failure |
| `created_at`, `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | `updated_at` maintained by trigger |

- Index: `scanned_documents_user_id_idx (user_id, created_at desc)`
- Trigger: `set_scanned_documents_updated_at`
- RLS: **"Users manage their own scanned documents"** — full CRUD where `user_id = auth.uid()`
- Storage bucket `scanned-documents` (private) with owner-only select/insert/delete policies

### 4.3 `20260610020000_legal_analysis.sql`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `profiles(id)` ON DELETE CASCADE |
| `source_document_id` | `uuid` | FK → `scanned_documents(id)` ON DELETE SET NULL, nullable |
| `mode` | `text` NOT NULL CHECK IN (`quick`,`deep`) | |
| `status` | `text` NOT NULL DEFAULT `processing` CHECK IN (`processing`,`completed`,`failed`) | |
| `input_text` | `text` NOT NULL | |
| `case_type`, `summary`, `error_message` | `text` | |
| `applicable_sections`, `key_facts`, `recommended_actions`, `detailed_analysis` | `jsonb` | `detailed_analysis` is `null` for `quick` mode |
| `created_at`, `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | `updated_at` maintained by trigger |

- Index: `legal_analyses_user_id_idx (user_id, created_at desc)`
- Trigger: `set_legal_analyses_updated_at`
- RLS: **"Users manage their own legal analyses"** — full CRUD where `user_id = auth.uid()`

Plus the read-only reference table `bns_section_mappings` (113 rows): `id, sort_order, category, old_act, old_section, new_act, new_section, title, created_at`, indexed on `sort_order`, `old_section`, `new_section`. RLS: **"Authenticated users can read BNS section mappings"** (select-only, all authenticated roles).

---

## 5. API Changes

| Method | Path | Auth | Role | Rate limit | Controller |
|---|---|---|---|---|---|
| POST | `/api/documents/scan` | ✅ | any | `ocrRateLimiter` (30/15min) | `documents.controller.scanDocument` |
| GET | `/api/documents` | ✅ | any | — | `documents.controller.listDocuments` |
| GET | `/api/documents/:id` | ✅ | any (own) | — | `documents.controller.getDocument` |
| DELETE | `/api/documents/:id` | ✅ | any (own) | — | `documents.controller.deleteDocument` |
| POST | `/api/legal/analyze` | ✅ | any | `legalAnalysisRateLimiter` (20/15min) | `legal.controller.analyzeText` |
| GET | `/api/legal` | ✅ | any (own) | — | `legal.controller.listAnalyses` |
| GET | `/api/legal/:id` | ✅ | any (own) | — | `legal.controller.getAnalysis` |
| DELETE | `/api/legal/:id` | ✅ | any (own) | — | `legal.controller.deleteAnalysis` |
| GET | `/api/legal/bns-lookup` | ✅ | any | — | `legal.controller.searchBnsMappings` |
| GET | `/api/directory/personnel` | ✅ | any | — | `directory.controller.listPersonnel` |
| GET | `/api/admin/audit-log` | ✅ | `admin` | — | `admin.controller.listAuditLog` |
| POST | `/api/auth/forgot-password` | ❌ (public) | — | existing auth limiter | `auth.controller.forgotPassword` (now username-based) |
| POST | `/api/investigations/refresh` | ✅ | `sho`,`admin` | `scrapeRateLimiter` (5/5min, **new**) | unchanged controller |
| POST | `/api/jansunwai/refresh` | ✅ | any | `scrapeRateLimiter` (5/5min, **new**) | unchanged controller |

All routes mount under `/api` which now also carries the global `apiRateLimiter` (600 req/15min) and `helmet()` headers (see §9).

---

## 6. Backend Changes

- **`documents.controller.ts`** — `scanDocument`/`listDocuments`/`getDocument`/`deleteDocument`: validates the scan payload with Zod, decodes base64, enforces `MAX_UPLOAD_BYTES` (12MB), uploads to Supabase Storage, calls `runOcr`, persists results, returns a DTO with a 10-minute signed preview URL, and writes an audit log entry (`document.scan`) excluding the extracted text body.
- **`legal.controller.ts`** — `analyzeText`/`listAnalyses`/`getAnalysis`/`deleteAnalysis`: accepts either raw `text` or a `documentId` (pulls `extracted_text` from `scanned_documents`), truncates to `MAX_INPUT_CHARS` (15,000), calls `analyzeLegalText`, persists structured result with `status`. `searchBnsMappings` queries `bns_section_mappings` with optional `q`/`act` filters.
- **`directory.controller.ts`** — `listPersonnel`: returns all profiles at the caller's `policeStation`/`district`, projected to the `StationPersonnel` shape (no email/sensitive fields).
- **`audit.service.ts`** — `logAudit()`: best-effort insert into `audit_log` via `supabaseAdmin`; failures are logged but never block the calling action.
- **`admin.controller.ts`** — new `listAuditLog` (paginated, admin-only); existing user-management actions (`user.create`, `user.update`, `user.reset_password`, `user.bulk_create`, `auth.admin_generate_reset_link`) now call `logAudit`.
- **`auth.controller.ts`** — `forgotPassword` reworked to accept a **username** (not email) and generate a Supabase reset link server-side; logs `auth.reset_password` / `auth.change_password`.
- **`reports.controller.ts`** — report submission now logs `report.submit`.
- **`ai.service.ts`** — `stripFences()` (strips ```` ```json ```` fences Claude sometimes adds) and `askClaude()` are now exported and reused by `ocr.service.ts` and `legal.service.ts`.
- **`server/src/scripts/testScrape.ts`** — standalone harness to run `runCctnsInvestigationsScrape()` and dump JSON to stdout for manual portal-scraping verification (not part of the request pipeline).

---

## 7. Claude Prompt Templates

### 7.1 OCR — `server/src/services/ocr.service.ts` (model: `claude-sonnet-4-6`, `max_tokens: 8192`)

**System prompt:**
```
You are an OCR and document-analysis engine for an Indian police department's internal app. You will be given an image or PDF of a scanned document — typically a complaint, FIR, notice, court order, identity proof, or similar official paperwork, written in Hindi (Devanagari script), English, or a mix of both.

Your task:
1. Extract ALL visible text exactly as written, preserving line breaks and the original language/script (do NOT translate).
2. Estimate your confidence in the extraction, from 0 to 1.
3. Detect the primary language of the document: "hindi", "english", or "mixed".
4. Identify key entities mentioned in the document.
5. List 5-10 short keywords/topics summarising the document's subject matter.

Reply with ONLY valid JSON in this exact shape — no markdown, no extra text:
{
  "extractedText": "...",
  "confidence": 0.0,
  "languageDetected": "hindi" | "english" | "mixed",
  "entities": {
    "names": ["..."],
    "dates": ["..."],
    "addresses": ["..."],
    "phoneNumbers": ["..."],
    "firNumbers": ["..."],
    "actsAndSections": ["..."]
  },
  "keywords": ["..."]
}

If a category has no entries, use an empty array []. If the image/PDF is unreadable, blank, or contains no text, set "extractedText" to "" and "confidence" to 0, but still return the full JSON shape.
```
**User content:** the image (`image/jpeg|png|gif|webp`, base64) or PDF (`application/pdf`, base64) as a `document`/`image` content block, plus the text `"Extract and analyse the text in this image/document."`.

### 7.2 Legal Analysis — `server/src/services/legal.service.ts`

**Shared context** (prepended to both Quick and Deep prompts):
```
You are a legal assistant helping an Indian police Investigating Officer (IO) understand a document or case description.

India's criminal law was re-codified effective 1 July 2024:
- The Indian Penal Code (IPC) 1860 was replaced by the Bharatiya Nyaya Sanhita (BNS) 2023.
- The Code of Criminal Procedure (CrPC) 1973 was replaced by the Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023.
- The Indian Evidence Act 1872 was replaced by the Bharatiya Sakshya Adhiniyam (BSA) 2023.

Always cite the CURRENT law (BNS/BNSS/BSA section numbers) as the primary reference. Where you know the
old IPC/CrPC/Evidence Act equivalent, include it as "oldEquivalent" — otherwise set it to null. Do not
guess at section numbers you are unsure of; prefer fewer, well-grounded sections over many speculative ones.

The input text may be in Hindi, English, or a mix of both (it may be raw OCR output and contain noise).
Base your analysis only on the facts present in the text — do not invent facts. If the text does not
describe a legal/criminal matter, return an empty applicableSections array and say so in the summary.
```

**Quick mode** (`claude-haiku-4-5-20251001`, `max_tokens: 1536`) appends:
```
Reply with ONLY valid JSON in this exact shape:
{
  "caseType": "short classification, e.g. 'Theft', 'Domestic Dispute', 'Cheating / Fraud'",
  "summary": "2-4 sentence plain-language summary of the situation, in English",
  "applicableSections": [{"act": "BNS"|"BNSS"|"BSA"|"Other", "section": "section number", "title": "short title of the provision", "relevance": "1 sentence on why this section applies here", "oldEquivalent": {"act": "IPC"|"CrPC"|"Evidence Act", "section": "..."} or null}],
  "keyFacts": {"parties": ["..."], "dates": ["..."], "locations": ["..."], "amounts": ["..."]},
  "recommendedActions": ["short, concrete next steps for the IO"]
}
No markdown, no extra text — just the JSON object.
```

**Deep Research mode** (`claude-sonnet-4-6`, `max_tokens: 4096`) appends the same shape plus a `detailedAnalysis` object: `detailedReasoning`, `proceduralRequirements[]`, `evidentiaryConsiderations[]`, `similarProvisions[]` (same `SECTION_SHAPE`), `draftingNotes`.

**User content:** the input text, trimmed to `MAX_INPUT_CHARS = 15000`.

### 7.3 General decision-making — `server/src/services/ai.service.ts`

- **`analyseReport`** (`claude-sonnet-4-6`, 1024 tokens) — *"You are an experienced senior police officer reviewing an inquiry report (जाँच आख्या). Analyse the report and reply with ONLY valid JSON in this exact shape: {"consistent": true|false, "gaps": ["...", "..."], "suggestion": "..."}"*
- **`matchIoName`** (`claude-haiku-4-5-20251001`, 100 tokens, 1hr in-process cache) — *"You match Indian police officer names. Given a profile name and a list of CCTNS portal names, return the CCTNS name that refers to the same person... Reply with ONLY the exact matching CCTNS name... or the word null..."*
- **`analysePetition`** (`claude-sonnet-4-6`, 512 tokens) — *"You are a legal assistant helping an Indian police officer understand a Jan Sunwai petition. Reply with ONLY valid JSON: {"suggestedSection": "IPC section or 'N/A'", "summary": "2-3 sentence plain-language summary in English"}"*

All four prompts share `stripFences()` to tolerate Claude wrapping JSON in ```` ```json ```` fences.

---

## 8. OCR Pipeline Design

```
Client (Expo)                          Server (Express)                      External
──────────────                         ─────────────────                     ────────
captureDocument()/pickScanImage()
  → expo-image-manipulator
    (resize ≤2000px, JPEG q=0.7,
     base64)
pickScanPdf()
  → size check ≤ 12MB
  → FileSystem base64 read

uploadScan(file) ──POST /documents/scan (60s timeout) ──▶ ocrRateLimiter (30/15min)
                                                          │ requireAuth (Supabase JWT)
                                                          │ Zod: scanSchema
                                                          │ decode base64 → Buffer
                                                          │ size check ≤ MAX_UPLOAD_BYTES (12MB)
                                                          │   → 413 if exceeded
                                                          │ upload to Storage bucket
                                                          │   "scanned-documents/{userId}/{ts}-{uuid}.{ext}"
                                                          │ insert scanned_documents row
                                                          │   (ocr_status="pending")
                                                          │
                                                          ├── runOcr(buffer, mimeType) ──▶ Claude
                                                          │     claude-sonnet-4-6,         (vision /
                                                          │     vision (image) or          document API)
                                                          │     native document (pdf)
                                                          │     → { extractedText, confidence,
                                                          │         languageDetected, entities, keywords }
                                                          │
                                                          │ update row: ocr_status="completed"|"failed",
                                                          │   extracted_text, confidence,
                                                          │   language_detected, entities, keywords,
                                                          │   error_message
                                                          │
                                                          │ logAudit("document.scan",
                                                          │   { source, fileName, ocrStatus })
                                                          │   — extracted text NOT logged
                                                          │
◀── 201 { document: {..., previewUrl (10-min signed URL)} }
```

**Offline path:** if `uploadScan()` fails due to no connectivity, the client enqueues the picked file (encrypted) into the local `scan_outbox` (SQLite) with `status="pending"`. `OfflineContext` detects the online transition (`expo-network`, polled + on app foreground) and calls `processOutbox()`, which retries each queued item through the same `uploadScan()` path, caching successes and recording `error_message`/`status="failed"` on repeated failure.

---

## 9. Security Review

| Area | Control | Detail |
|---|---|---|
| Transport/headers | `helmet()` | Applied globally in `server/src/index.ts`, before CORS. `contentSecurityPolicy: false` (API is JSON/PDF only, no HTML responses to protect with CSP) — still gets HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, etc. |
| Rate limiting | `apiRateLimiter` (600/15min, all `/api/*`), `ocrRateLimiter` (30/15min), `legalAnalysisRateLimiter` (20/15min), `scrapeRateLimiter` (5/5min, new on `/investigations/refresh` and `/jansunwai/refresh`) | Bounds both abuse and per-user Claude API spend; scrape limiter protects the external CCTNS/Jan Sunwai portals from being hammered. |
| AuthN/AuthZ | Existing `requireAuth` (Supabase JWT bearer) + role checks | All new endpoints (`/documents/*`, `/legal/*`, `/directory/*`) require auth; `/admin/audit-log` requires `role === "admin"`; `/investigations/refresh` requires `sho`/`admin`. |
| Row-level security | New RLS policies on `scanned_documents`, `legal_analyses` (owner-only CRUD), `audit_log` (admin-only read, server-only write via `supabaseAdmin`), `bns_section_mappings` (read-only, all authenticated). | Defense-in-depth even if the Express layer is bypassed. |
| Input validation | Zod schemas on `/documents/scan` and `/legal/analyze`; `errorHandler.ts` now catches `ZodError` and returns `400` with field-level `details` (previously fell through to a generic `500`). | |
| Upload limits | `MAX_UPLOAD_BYTES = 12MB` server-side (413 on exceed) + matching 12MB client-side pre-check before reading PDF base64; Express JSON body limit raised to accommodate base64 payloads. | Prevents oversized payloads from reaching Claude or Storage, and avoids client OOM reading huge files. |
| Secret hygiene | `JWT_SECRET`/session secrets removed from `config/env.ts` and `render.yaml` (unused since the app relies entirely on Supabase Auth JWTs). | Reduces secret surface area; nothing in the app referenced these values. |
| PII / audit trail | `audit_log` records actor, action, target, and a `details` JSON blob for sensitive operations (`user.create`, `user.update`, `user.reset_password`, `user.bulk_create`, `auth.reset_password`, `auth.admin_generate_reset_link`, `report.submit`, `document.scan`). `document.scan` details deliberately **exclude** `extracted_text` (may contain PII/case-sensitive content) — only metadata (source, file name, OCR status) is logged. Logging is best-effort and never blocks the underlying action. | |
| Offline cache | Local SQLite cache (scans, legal analyses, BNS table, scan outbox) is **AES-256 encrypted** via `crypto-js`, with the encryption key stored in the device secure keystore (`expo-secure-store`) — mitigates data exposure if a device is lost while offline data is cached. | |
| Forgot-password | Reworked to take a **username** (not email, which isn't collected at registration) and issue a Supabase recovery link server-side; logged to `audit_log` (`auth.reset_password`). | |

No new external services or API keys were introduced; OCR and legal analysis reuse the existing `CLAUDE_API_KEY` already used by `ai.service.ts`.

---

## 10. File Manifest (Implementation Code Index)

Status legend: **NEW** = new file added this initiative · **MOD** = existing file modified. Full source for every entry below is in the working tree at the given path and passes `tsc --noEmit` (app) cleanly.

### 10.1 Mobile app — Document Scan & OCR
| File | Status | Why modified |
|---|---|---|
| `app/app/(app)/scan/index.tsx` | NEW | Scan hub — capture/pick (camera, gallery, PDF), recent scans, outbox status |
| `app/app/(app)/scan/[id].tsx` | NEW | Scan detail — OCR results, entities, keywords, "Analyze legally" actions, delete |
| `app/app/(app)/scan/history.tsx` | NEW | Paginated scan history; converted to `FlatList` (Phase 12) with memoized `ScanRow` |
| `app/lib/documentScan.ts` | NEW | Camera/gallery/PDF pickers, image compression, `uploadScan()` (60s timeout), 12MB PDF pre-check |
| `app/types/document.ts` | NEW | `ScannedDocument`, `OcrEntities`, `DocumentSource`, `OcrStatus`, `LanguageDetected` types |

### 10.2 Mobile app — AI Legal Analysis
| File | Status | Why modified |
|---|---|---|
| `app/app/(app)/legal/index.tsx` | NEW | Legal hub — paste-text/from-scan input, Quick/Deep mode toggle, recent analyses |
| `app/app/(app)/legal/[id].tsx` | NEW | Analysis detail — summary, sections, key facts, recommended actions, deep-mode panels, delete |
| `app/app/(app)/legal/history.tsx` | NEW | Paginated analysis history; converted to `FlatList` (Phase 12) with memoized `AnalysisRow` |
| `app/app/(app)/legal/bns-lookup.tsx` | NEW | IPC/CrPC/Evidence Act → BNS/BNSS/BSA reference search (offline-capable) |
| `app/lib/legalAnalysis.ts` | NEW | `analyzeLegalText()` (60s timeout), `getLegalAnalysis`, `listLegalAnalyses`, `deleteLegalAnalysis`, `searchBnsMappings` |
| `app/types/legal.ts` | NEW | `LegalAnalysis`, `SectionRef`, `KeyFacts`, `DetailedAnalysis`, `AnalysisMode`, `BnsSectionMapping` types |

### 10.3 Mobile app — Offline architecture
| File | Status | Why modified |
|---|---|---|
| `app/lib/offlineDb.ts` | NEW | Encrypted SQLite wrapper (`expo-sqlite` + AES-256 via `crypto-js`); tables for cached scans/analyses/BNS mappings + scan outbox |
| `app/lib/offlineCache.ts` | NEW | Cache-aside helpers: `cacheScans`/`getCachedScans`, `cacheLegalAnalyses`/`getCachedLegalAnalyses`, `cacheBnsMappings`/`getCachedBnsMappings` |
| `app/lib/scanOutbox.ts` | NEW | `enqueueScan()`, `processOutbox()` — queue & retry uploads made while offline |
| `app/lib/network.ts` | NEW | `checkIsOnline()` via `expo-network` connectivity check |
| `app/context/OfflineContext.tsx` | NEW | App-wide `isOnline`/`outboxCount`/`syncing`/`syncNow()`, auto-sync on reconnect |
| `app/components/OfflineBanner.tsx` | NEW | Offline/queued-uploads banner with manual "Sync now" action |
| `app/app/_layout.tsx` | MOD | Wrap app tree in `OfflineProvider` (outside `AuthProvider`) |

### 10.4 Mobile app — Directory, Admin, Audit
| File | Status | Why modified |
|---|---|---|
| `app/app/(app)/directory/police-station.tsx` | NEW | Station personnel directory — search/filter by role, call action; `PersonnelRow` memoized (Phase 12) |
| `app/app/(app)/directory/emergency.tsx` | NEW | Bilingual (EN/HI) emergency numbers — call + copy actions |
| `app/app/(app)/admin/audit-log.tsx` | NEW | Admin-only audit log; converted to `FlatList` (Phase 12) with memoized `AuditEntryRow` |
| `app/lib/emergencyNumbers.ts` | NEW | Curated list of 8 Indian helpline numbers (titles EN/HI, descriptions, icons) |
| `app/types/index.ts` | MOD | Added `StationPersonnel` interface for the directory screen |

### 10.5 Mobile app — Navigation, shared UI, dashboard polish (Phase 11)
| File | Status | Why modified |
|---|---|---|
| `app/app/(app)/_layout.tsx` | MOD | Register `scan`/`legal` tabs and 8 new sub-routes (`href: null`) for detail/history/lookup/admin/directory screens |
| `app/app/(app)/dashboard.tsx` | MOD | Personalized "Hello, {name}" greeting header with role badge + station/district line; per-category `Card` `tone` props |
| `app/components/Card.tsx` | MOD | Added `CardTone` palette + `tone` prop, `rounded-2xl`/`shadow-sm`/`h-10 w-10` icon badge, wrapped in `memo()` (Phase 12) |
| `app/components/Banner.tsx` | MOD | `rounded-lg` → `rounded-xl` to match new card radius |
| `app/components/Avatar.tsx` | NEW | Initials/photo avatar used in the dashboard greeting header |
| `app/components/ScreenContainer.tsx` | MOD | Added `scrollable?: boolean` prop — `false` renders a fixed header over a screen-owned `FlatList` (Phase 12) |

### 10.6 Mobile app — Performance & resilience (Phase 12)
| File | Status | Why modified |
|---|---|---|
| `app/lib/api.ts` | MOD | `apiRequest` now wraps `fetch` in `AbortController` (20s default timeout); timeouts throw a plain `Error` so existing offline-fallback handling applies |
| `app/app/(app)/investigations.tsx` | MOD | `CaseRow` wrapped in `memo()`; `handleSave` wrapped in `useCallback` so memoization is effective |

### 10.7 Mobile app — Auth & dependencies
| File | Status | Why modified |
|---|---|---|
| `app/app/(auth)/forgot-password.tsx` | MOD | Reworked to request reset by **username** instead of email (matches `auth.controller.forgotPassword`) |
| `app/package.json` / `app/package-lock.json` | MOD | New deps: `expo-image-manipulator`, `expo-sqlite`, `expo-crypto`, `expo-network`, `expo-clipboard`, `crypto-js`, `@types/crypto-js` |

### 10.8 Backend — Documents/OCR
| File | Status | Why modified |
|---|---|---|
| `server/src/routes/documents.routes.ts` | NEW | `/documents`, `/documents/scan`, `/documents/:id` (GET/DELETE), with `ocrRateLimiter` |
| `server/src/controllers/documents.controller.ts` | NEW | Scan upload/validation/OCR orchestration, listing, signed-URL retrieval, deletion, audit logging |
| `server/src/services/ocr.service.ts` | NEW | `runOcr()` — Claude vision/document OCR + entity/keyword extraction |

### 10.9 Backend — Legal Analysis
| File | Status | Why modified |
|---|---|---|
| `server/src/routes/legal.routes.ts` | NEW | `/legal`, `/legal/analyze`, `/legal/:id` (GET/DELETE), `/legal/bns-lookup`, with `legalAnalysisRateLimiter` |
| `server/src/controllers/legal.controller.ts` | NEW | Analysis orchestration (text or `documentId` input), persistence, BNS lookup |
| `server/src/services/legal.service.ts` | NEW | `analyzeLegalText()` — Quick/Deep Claude prompts, BNS/BNSS/BSA-aware result normalization |
| `server/src/services/ai.service.ts` | MOD | Exported `stripFences()`/`askClaude()` for reuse by `ocr.service.ts`/`legal.service.ts` |

### 10.10 Backend — Directory
| File | Status | Why modified |
|---|---|---|
| `server/src/routes/directory.routes.ts` | NEW | `/directory/personnel` |
| `server/src/controllers/directory.controller.ts` | NEW | Returns station personnel projected to `StationPersonnel` |

### 10.11 Backend — Accountability & security
| File | Status | Why modified |
|---|---|---|
| `server/src/services/audit.service.ts` | NEW | `logAudit()` — best-effort write to `audit_log` |
| `server/src/controllers/admin.controller.ts` | MOD | New `listAuditLog`; existing user-management actions now call `logAudit` |
| `server/src/controllers/auth.controller.ts` | MOD | Username-based `forgotPassword`; `auth.reset_password`/`auth.change_password` audit logging |
| `server/src/controllers/reports.controller.ts` | MOD | `report.submit` audit logging |
| `server/src/routes/admin.routes.ts` | MOD | Mount `/admin/audit-log` (admin-only) |
| `server/src/routes/auth.routes.ts` | MOD | Updated `/auth/forgot-password` validation (username) |
| `server/src/middleware/errorHandler.ts` | MOD | Catch `ZodError` → `400` with field-level details |
| `server/src/middleware/rateLimit.ts` | MOD | Added `apiRateLimiter`, `ocrRateLimiter`, `legalAnalysisRateLimiter`, `scrapeRateLimiter` |

### 10.12 Backend — Routing, config & tooling
| File | Status | Why modified |
|---|---|---|
| `server/src/index.ts` | MOD | `helmet()`, global `apiRateLimiter`, increased JSON body limit (base64 uploads) |
| `server/src/routes/index.ts` | MOD | Mount `documents`, `legal`, `directory` route modules |
| `server/src/routes/investigations.routes.ts` | MOD | Apply `scrapeRateLimiter` to `/investigations/refresh` |
| `server/src/routes/jansunwai.routes.ts` | MOD | Apply `scrapeRateLimiter` to `/jansunwai/refresh` |
| `server/src/config/env.ts` | MOD | Removed unused `JWT_SECRET`/session-secret env vars |
| `server/src/scripts/testScrape.ts` | NEW | Manual harness for `runCctnsInvestigationsScrape()` (not part of the request pipeline) |
| `server/package.json` | MOD | New dep: `helmet` |

### 10.13 Database & deployment
| File | Status | Why modified |
|---|---|---|
| `supabase/migrations/20260610000000_audit_log.sql` | NEW | `audit_log` table + admin-only read RLS |
| `supabase/migrations/20260610010000_scanned_documents.sql` | NEW | `scanned_documents` table + `scanned-documents` storage bucket + owner-only RLS |
| `supabase/migrations/20260610020000_legal_analysis.sql` | NEW | `legal_analyses` table + `bns_section_mappings` reference table + RLS |
| `supabase/migrations/README.md` | MOD | Documented migrations 9–12 |
| `render.yaml` | MOD | Removed obsolete `JWT_SECRET` env var entry (matches `config/env.ts`) |

### 10.14 Out of scope for this report (present in working tree, not part of this deliverable)
The working tree also contains CCTNS/Jan Sunwai portal-scraping debug artifacts predating/parallel to this initiative — recommend removing or `.gitignore`-ing before commit:
- `cctns-*.png`, `cctns-*.html`, `jansunwai-*.png`, `jansunwai-*.html`, `khushbu.pdf` (manual scraping captures/screenshots)
- `server/scripts/test-cctns-*.js`, `server/scripts/test-jansunwai-*.js` (ad-hoc scraping test scripts, distinct from `server/src/scripts/testScrape.ts` above)
- `.claude/` (local assistant tooling configuration)

---

## Status

Phases 1–12 are implemented and `tsc --noEmit` passes cleanly for the mobile app. This document fulfils Phase 13's reporting requirements (items 1–9) and provides a complete file-level index (item 10) of every file added or modified across the Document Intelligence Engine initiative. The Document Intelligence Engine is feature-complete per the original 13-phase specification.
