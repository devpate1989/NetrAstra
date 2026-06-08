# Project Build Prompt — Cross-Platform App (Web + Android + iOS)

## Your Role

Act as a senior, full-stack software engineer with combined expertise as a:
- Web developer
- App developer (mobile)
- iOS app developer
- Android app developer
- UI/UX developer
- Senior programmer / architect

You are responsible for designing and building a production-quality product end to end — frontend, backend, database, third-party integrations, and deployment guidance.

## Project Overview

Build **one product that ships to three targets**: a website/web app, an Android app, and an iOS app — all generated from a **single shared React Native codebase** (using React Native + React Native for Web, e.g. via Expo, so that one codebase produces the web build and the native Android/iOS builds). Do not build three separate codebases; maximize code reuse across platforms and isolate platform-specific code only where unavoidable (e.g. native modules, platform-specific UI tweaks).

## User Roles & Access Control

The app must support **role-based access** with at least three roles:

1. **Investigating Officer (IO)** — fills and submits inquiry Reports (module 7), and uses the CCTNS/Jan Sunwai integrations (modules 8–9) to view their own pending investigations/applications and start new reports directly from them.
2. **SHO (Station House Officer)** — oversees a police station; sees the IO-wise categorized pending-investigations view on their dashboard (read-only).
3. **Admin** — full oversight; sees the same IO-wise data as the SHO, and can additionally **edit the IO's name** and **edit the "धारा" (Section)** recorded against each case/investigation.

Registration/login should capture or assign a role, each role should only see the screens/data/actions relevant to it (enforce this both in the UI navigation and at the API/DB layer — e.g. Supabase row-level security policies plus role checks in the Express API), and an Admin should be able to manage/change other users' roles.

## Tech Stack (mandatory)

- **Frontend / Mobile:** React Native (with React Native for Web for the website/web app)
- **Backend:** Node.js with Express.js
- **Database & Backend-as-a-Service:** Supabase (Postgres database, Auth, Storage — used for storing all application data)
- **Styling:** Tailwind CSS (e.g. via NativeWind for React Native, and Tailwind directly for the web build)
- **AI / Intelligence:** Google Gemini API — used for (a) reading/solving CAPTCHAs and (b) decision-making logic within the app's workflows
- **Transactional Email:** Resend API — used for all authentication-related emails (signup confirmation, password reset, notifications, etc.)
- **Web Scraping / External Portal Integration:** a Node.js scraping toolkit appropriate to each target site — Puppeteer or Playwright for JS-rendered portals (handles login flows, sessions, and CAPTCHAs), or axios + cheerio for simpler server-rendered HTML — used to log into and extract data from the external CCTNS portal and the Jan Sunwai portal (modules 8–9)

## Third-Party Integrations — Details

1. **Gemini API**
   - Use it to read and interpret CAPTCHA images (OCR / vision understanding).
   - Use it for decision-making logic wherever the app needs to evaluate input and choose an outcome (define clear prompts/inputs and structured outputs for these decisions).
   - Handle API keys securely via environment variables / server-side calls only — never expose the Gemini API key in client-side code.

2. **Supabase**
   - Use Supabase as the primary database and storage layer for all app data (users, profiles, reports, generated PDFs, etc.).
   - Use Supabase Auth for user identity where it fits the authentication flows below (or a custom Express-based auth layer backed by the Supabase Postgres database — choose whichever is cleaner for this stack and explain the choice).
   - Use Supabase Storage for storing uploaded files (e.g. the report PDF sample template, generated report PDFs).

3. **Resend (Email API)**
   - Use Resend for sending all authentication and transactional emails: registration/verification emails, login alerts (if applicable), forgot-password emails, reset-password confirmations, etc.
   - Send these emails from the Express backend (never directly from the client).

## Required Modules / Screens

Build the following modules, available consistently across web, Android, and iOS:

1. **User Registration**
   - Sign-up form, input validation, account creation in Supabase, verification email via Resend.

2. **User Login**
   - Secure authentication, session/token handling shared across web and mobile.

3. **Forgot Password**
   - User requests a password reset; a reset link/code is emailed via Resend.

4. **Reset Password**
   - User sets a new password via the link/code from the forgot-password email; update credentials securely in Supabase.

5. **Dashboard**
   - Landing screen after login showing the user's overview/summary information (define a sensible layout: recent activity, quick links to Profile and Report, key stats, etc.).

6. **Profile**
   - View and edit personal/account information, avatar, contact details, password/account settings.

7. **Report (Police Inquiry / Investigation Report)**
   - A form/section where the user (an investigating officer) fills in the details of a field inquiry into a complaint/dispute, submits it, and the app auto-generates a **PDF** that visually and structurally matches the supplied sample template `khushbu.pdf` (a real Uttar Pradesh Police "जाँच हेतु बिन्दुकृत कार्यवाही का विवरण" / point-wise inquiry report format).
   - **Language & layout:** All labels in the sample are in **Hindi (Devanagari script)**, several with an English gloss in brackets (e.g. "State (राज्य)"). Build the form and the generated PDF to render Devanagari correctly (use a Unicode Hindi-supporting font such as Noto Sans Devanagari for PDF generation), and support bilingual labels exactly as in the sample. Treat the Hindi label text as the canonical field labels.
   - **Document structure to replicate** — the report has two parts:

   **Part A — Main Inquiry Report ("जाँच हेतु बिन्दुकृत कार्यवाही का विवरण")**
   - Header block: addressee ("सेवा में, श्रीमान वरिष्ठ पुलिस अधीक्षक महोदय, जनपद-<District>"), subject/reference number (सन्दर्भ संख्या), and date (दिनांक) — these should be editable fields, not hardcoded.
   - A **numbered list of 23 structured fields** (क्र.सं. 1–23), each its own input (single-line, multi-line/paragraph, or structured sub-fields as noted):
     1. Complainant's name, address & mobile number (शिकायतकर्ता का नाम, पता व मो. नम्बर)
     2. Opposite party's name, address & mobile number (विपक्षी का नाम, पता व मो. नम्बर)
     3. Brief description of the complaint/allegation (शिकायत/आरोप का संक्षिप्त विवरण)
     4. Investigating officer's name, designation & mobile number (जाँच अधिकारी का नाम, पद व मो. नम्बर)
     5. FIR details, if registered in the case (प्रकरण में FIR दर्ज है तो FIR का पूर्ण विवरण — else "निल"/Nil)
     6. Category of dispute — domestic land / illegal possession / other (विवाद की श्रेणी — जमीन घरेलू/अपाधिकृत/अन्य विवाद)
     7. Statement of the applicant/complainant (आवेदक/शिकायतकर्ता का बयान — long text)
     8. Statement of the opposite party (विपक्षीगण के बयान — long text)
     9. Statements of independent witnesses, with name, address & mobile number (स्वतंत्र साक्षीगण के बयान — repeatable group)
     10. Whether any prior offence occurred related to this dispute; full details if yes (विवाद को लेकर पूर्व में अपराध हुआ है या नहीं)
     11. If the case relates to a land dispute — name & mobile no. of the joint team that visited the spot, and outcome of the proceedings (यदि प्रकरण भूमि विवाद से संबंधित है)
     12. In case of a dispute, the bond/security amount taken under Section 126/135 BNSS (विवाद की दशा में धारा 126/135 बीएनएसएस की कार्यवाही में कितनी धनराशि के मुचलके से पाबन्द किया गया)
     13. Whether this application was submitted for the first time or previously; if previously, a chronological account and outcomes (प्रार्थना पत्र पहली बार दिया गया है या पूर्व में दिया जा चुका है)
     14. Whether the complainant or any party informed UP-112; if yes, attach the UP-112 PRV closure report (प्रकरण में क्या वादी या किसी पक्ष द्वारा यूपी-112 को सूचित किया गया)
     15. Whether action under Section 170 BNSS was one-sided or two-sided, and whether the accused were presented before the Magistrate (प्रकरण में धारा 170 बीएनएसएस की कार्यवाही)
     16. Details of any pending case in the Hon'ble Court — court name, case number, current status, next date if pending, outcome if disposed (प्रकरण के संबंध में यदि माननीय न्यायालय में कोई वाद प्रचलित है)
     17. Date of the investigating officer's site visit, plus a **Google-Sheet/location photo with Latitude & Longitude** (जाँच अधिकारी के मौके पर जाने का दिनांक तथा गूगल शीट फोटो Longitude and Latitude सहित) — needs photo upload + numeric lat/long capture (e.g. via device GPS)
     18. Continuation of the "first application / prior submissions" chronological record (प्रार्थनापत्र पहली बार दिया गया है या पूर्व में दिया जा चुका है — तिथिवार विवरण तथा परिणाम)
     19. Details of any compromise/settlement reached — attach a copy, with signatures of the related parties, date, police-station seal & SHO's signature (प्रकरण में यदि कोई समझौता हुआ है)
     20. **Analytical conclusion & recommendation of the inquiry** (जांच का विश्लेषणात्मक निष्कर्ष एवं संस्तुति — महोदय...) — long narrative text summarizing findings and recommended resolution
     21. Feedback notes / summary of conversation with the complainant (फीडबैक टिप्पणी/शिकायतकर्ता से वार्ता का सारांश)
     22. Whether the complainant is satisfied or not, with a clear explanation if not satisfied (शिकायतकर्ता संतुष्ट है अथवा असंतुष्ट यदि असंतुष्ट है तो उसका स्पष्ट विवरण)
     23. Any other comments (कोई अन्य टिप्पणी)
   - **Attachment:** one or more site-visit photographs (e.g. officer with the complainant/parties at the disputed location), embedded in the generated PDF.
   - **Signature block:** investigating officer's signature (captured digitally or as an uploaded image), name, rank/designation (e.g. "उ0नि0" / SI – Sub-Inspector), police station (थाना), district (जनपद), and date.

   **Part B — General Diary (G.D.) Details / सामान्य डायरी विवरण**
   - State (राज्य), Police Station / P.S. (थाना), District (जिला)
   - G.D. No. (रोजनामचा सं.), G.D. Date & time (रोजनामचा दिनांक), G.D. Type (रोजनामचा प्रकार)
   - Entry for / officer (प्रविष्टि अधिकारी के लिए), Case Type (प्रकरण के प्रकार)
   - G.D. Brief — long narrative text (रोजनामचा संक्षिप्त विवरण)
   - Subject (विषय)
   - **Acts & Sections table** (अधिनियम और धारा) — repeatable rows with columns: S.No. (क्र.सं.), Acts (अधिनियम), Sections (धारा)
   - "Report printed on" / "Report printed by" — date, and reporting officer's Name, Rank, Number
   - Two officers' sign-off blocks — each with Name (नाम), Rank (पद), Number (सं.), and Signature (हस्ताक्षर)
   - **Implementation notes for this report module:**
   - Model the form as a structured, validated multi-step or single scrollable form (group fields by Part A points 1–23, then Part B GD fields) so officers can fill it efficiently on mobile and web alike.
   - Persist each submission as structured data in Supabase (one row/record per report, with related tables for repeatable groups like witnesses and Acts & Sections rows, plus file references for photos/signatures), not just as a flattened PDF — this enables search, edit, and re-generation later.
   - Generate the PDF server-side (Express) using a PDF library that supports embedding a Devanagari/Unicode font, images (site photos, signatures), and tables, laid out to mirror the sample's two-part structure, numbering, and headers as closely as possible.
   - Store the generated PDF in Supabase Storage and link it to the report record; make submitted/generated reports listable, viewable, and downloadable from the Dashboard and/or Profile.
   - Optionally use the **Gemini API** here too — e.g. to help auto-draft the long narrative fields (statements, analytical conclusion, GD brief) from short officer notes, or to validate/cross-check entered data for consistency — if the user wants this; otherwise keep these as plain text-entry fields.

8. **FIR / CCTNS Pending-Investigations Tracker (Web Scraping Integration)**
   - The user will provide a **CCTNS Portal URL** plus **login credentials** for an external case-management/CCTNS portal used by the police department.
   - Build a backend (Express) service that:
     - Logs into that external website using the provided credentials (store credentials only as encrypted, server-side configuration — e.g. environment variables or a restricted Supabase table — never in client code or anywhere a client can read them).
     - Scrapes/extracts the list of **pending investigations for that specific police station (थाना)**.
     - Parses and **categorizes the results by Investigating Officer (IO)**.
     - Normalizes and stores the results in Supabase, so the dashboards read from your own database rather than re-scraping on every page load.
   - Display this IO-wise categorized pending-investigations data:
     - On the **SHO Dashboard** — grouped/listed by IO (read-only view).
     - On the **Admin Dashboard** — the same grouped view, plus the Admin can **edit the IO's name** and **edit the "धारा" (Section)** recorded against each case.
   - Implementation notes: pick a scraping approach suited to the target site (headless browser via Puppeteer/Playwright if it's JS-rendered and login-gated; lightweight HTTP + HTML parsing via axios/cheerio if it's simple server-rendered HTML); run the scrape on a schedule (cron) and/or on-demand refresh; handle login-session expiry/re-authentication; isolate the site-specific selectors/parsing logic so it's easy to update if the target site's markup changes; use the **Gemini API** for CAPTCHA-solving here if the portal's login is CAPTCHA-protected (per the Gemini integration described above).

9. **Jan Sunwai (जनसुनवाई) Pending Applications → Report Creation**
   - Integrate with the **Jan Sunwai / जनसुनवाई public-grievance redressal portal** the same way — URL and credentials provided by the user, fetched/scraped server-side using the same security and storage approach as module 8.
   - For each Investigating Officer, surface their pending जनसुनवाई items as a list of **आवेदन संख्या (application numbers)**:
     - The IO opens "Pending Jan Sunwai" and sees the list of all आवेदन संख्या assigned to them that are still pending.
     - Tapping/clicking a specific आवेदन संख्या opens that **प्रार्थना पत्र (petition/application)**:
       - If it's a **PDF** → render/embed it in-app so the officer can read it.
       - If it's **plain text** → render the text so the officer can read it.
     - From that application's detail view, show a **"Create Report"** button that takes the officer straight into the **Report form** (module 7's 23-point inquiry report), **pre-filling whatever fields can be derived** from the जनसुनवाई application data (e.g. complainant name/address/mobile, आवेदन संख्या / reference number, brief description of the complaint), so the officer only needs to complete the inquiry-specific fields.
   - End-to-end workflow this enables: pending grievance → read the application → auto-start an inquiry report (pre-filled) → fill remaining fields → submit → generate the matching PDF (module 7).

## Cross-Platform Requirements

- One shared codebase and shared business logic/state management across web, Android, and iOS.
- Responsive, adaptive UI: the same screens should look and feel native and polished on a browser (web), an Android phone, and an iPhone.
- Shared API layer (Express + Supabase) consumed identically by all three targets.
- Provide build/deployment guidance for all three: web hosting, Android (Play Store-ready build), and iOS (App Store-ready build).

## Implementation Notes

- Keep all secrets (Gemini API key, Supabase keys, Resend API key, CCTNS-portal credentials, Jan Sunwai credentials, etc.) server-side / in environment variables (see `.env`) — never bundle them into the client app or commit them to source control (see `.gitignore`).
- Follow secure coding practices for authentication (password hashing, secure session/token handling, rate limiting on auth endpoints, etc.).
- Use Tailwind CSS (via NativeWind on the React Native side) for consistent styling across all platforms.
- Structure the project so that platform-specific code is clearly isolated and minimal.

## Reference Sample

- A sample report PDF, `khushbu.pdf`, has been provided (located at the project root) and is the **authoritative reference** for the Report module's field list, ordering, numbering, bilingual (Hindi/English) labels, two-part layout (main inquiry report + General Diary), tables, photo placement, and signature blocks. The full field structure has already been extracted into the "Report" section above — use it as the source of truth when building the form and the PDF generator, and consult `khushbu.pdf` directly for exact visual layout/spacing/fonts to match.
