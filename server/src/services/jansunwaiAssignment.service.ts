import { supabaseAdmin } from "../config/supabase";
import { isAiConfigured, matchIncidentVillage, matchIoName } from "./ai.service";
import { createNotification } from "./notifications.service";

interface PendingApplication {
  id: string;
  application_number: string | null;
  petitioner_address: string | null;
  subject: string | null;
  description: string | null;
}

interface ChowkiRow {
  id: string;
  name: string;
  in_charge_name: string | null;
  police_station: string | null;
}

interface VillageRow {
  chowki_id: string;
  village_name: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  police_station: string | null;
}

async function markUnmatched(applicationId: string, chowkiId: string): Promise<void> {
  await supabaseAdmin
    .from("jansunwai_applications")
    .update({ assigned_chowki_id: chowkiId, assignment_source: "ai_unmatched" })
    .eq("id", applicationId);
}

async function assignApplication(
  app: PendingApplication,
  villages: VillageRow[],
  chowkiById: Map<string, ChowkiRow>,
  villageNames: string[],
  profiles: ProfileRow[]
): Promise<void> {
  const incidentText = [app.petitioner_address, app.subject, app.description].filter(Boolean).join("\n");
  if (!incidentText.trim()) return;

  const matchedVillage = await matchIncidentVillage(incidentText, villageNames);
  if (!matchedVillage) return;

  const village = villages.find((v) => v.village_name === matchedVillage);
  const chowki = village ? chowkiById.get(village.chowki_id) : undefined;
  if (!chowki) return;

  if (!chowki.in_charge_name) {
    await markUnmatched(app.id, chowki.id);
    return;
  }

  const candidateProfiles = profiles.filter((p) => p.police_station === chowki.police_station);
  const candidateNames = (candidateProfiles.length > 0 ? candidateProfiles : profiles)
    .map((p) => p.full_name)
    .filter((n): n is string => Boolean(n));

  const matchedName = await matchIoName(chowki.in_charge_name, candidateNames);
  const matchedProfile = matchedName ? profiles.find((p) => p.full_name === matchedName) : undefined;

  if (!matchedProfile) {
    await markUnmatched(app.id, chowki.id);
    return;
  }

  await supabaseAdmin
    .from("jansunwai_applications")
    .update({
      assigned_io_id: matchedProfile.id,
      assigned_io_name: matchedProfile.full_name,
      assigned_chowki_id: chowki.id,
      assignment_source: "ai_chowki",
    })
    .eq("id", app.id);

  await createNotification(
    matchedProfile.id,
    "jansunwai_assigned",
    "नई जनसुनवाई आवेदन आवंटित",
    `आवेदन संख्या ${app.application_number ?? ""} आपको ${chowki.name} के अंतर्गत आवंटित किया गया है।`,
    { applicationId: app.id, applicationNumber: app.application_number, chowkiName: chowki.name }
  );
}

/**
 * For every pending Jan Sunwai application that hasn't been assigned to an IO
 * yet, uses Claude to match its incident location (पता / घटनास्थल) against the
 * थाना's चौकी/हल्का → गाँव directory, then assigns it to that चौकी/हल्का प्रभारी's
 * profile (matched by name) and notifies them. Never throws — failures for an
 * individual application are logged and the rest continue.
 */
export async function autoAssignPendingApplications(): Promise<void> {
  if (!isAiConfigured()) return;

  const { data: apps, error: appsError } = await supabaseAdmin
    .from("jansunwai_applications")
    .select("id, application_number, petitioner_address, subject, description")
    .is("assigned_io_id", null)
    .eq("status", "pending");

  if (appsError) {
    console.error("[jansunwai-assign] Failed to load pending applications:", appsError.message);
    return;
  }
  if (!apps || apps.length === 0) return;

  const [chowkisRes, villagesRes, profilesRes] = await Promise.all([
    supabaseAdmin.from("chowkis").select("id, name, in_charge_name, police_station"),
    supabaseAdmin.from("chowki_villages").select("chowki_id, village_name"),
    supabaseAdmin.from("profiles").select("id, full_name, police_station").in("role", ["io", "sho"]),
  ]);

  if (chowkisRes.error || villagesRes.error || profilesRes.error) {
    console.error(
      "[jansunwai-assign] Failed to load chowki/profile directory:",
      chowkisRes.error?.message || villagesRes.error?.message || profilesRes.error?.message
    );
    return;
  }

  const chowkis = (chowkisRes.data ?? []) as ChowkiRow[];
  const villages = (villagesRes.data ?? []) as VillageRow[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];

  const chowkiById = new Map(chowkis.map((c) => [c.id, c]));
  const villageNames = [...new Set(villages.map((v) => v.village_name))];

  for (const app of apps as PendingApplication[]) {
    try {
      await assignApplication(app, villages, chowkiById, villageNames, profiles);
    } catch (err) {
      console.error(`[jansunwai-assign] Failed to assign application ${app.application_number}:`, err);
    }
  }
}
