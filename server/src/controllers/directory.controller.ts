import { Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";

const SELECT_COLUMNS = "id, username, full_name, role, police_station, district, phone, avatar_url";

const ROLE_ORDER: Record<string, number> = { admin: 0, sho: 1, io: 2 };

function toPersonnelDto(row: Record<string, any>) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    policeStation: row.police_station,
    district: row.district,
    phone: row.phone,
    avatarUrl: row.avatar_url,
  };
}

/**
 * Read-only station personnel directory (Phase 7) — every authenticated user
 * can look up colleagues' role and contact number, e.g. to find the SHO.
 * Built on `profiles`, the same table /admin/users manages.
 */
export const listPersonnel = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(SELECT_COLUMNS)
    .order("full_name", { ascending: true });

  if (error) throw new HttpError(400, error.message);

  const personnel = (data ?? [])
    .map(toPersonnelDto)
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));

  res.json({ personnel });
});

function toChowkiOfficerDto(row: Record<string, any>) {
  return {
    id: row.id,
    fullName: row.full_name,
    designation: row.designation,
    phone: row.phone,
    pno: row.pno,
  };
}

function toChowkiVillageDto(row: Record<string, any>) {
  return {
    id: row.id,
    villageName: row.village_name,
    beatNumber: row.beat_number,
  };
}

function toBeatDto(row: Record<string, any>) {
  return {
    id: row.id,
    beatNumber: row.beat_number,
    si: row.si_name ? { name: row.si_name, phone: row.si_phone, pno: row.si_pno } : null,
    staff: row.staff_name ? { name: row.staff_name, phone: row.staff_phone } : null,
    linkOfficer: row.link_officer_name ? { name: row.link_officer_name, phone: row.link_officer_phone } : null,
  };
}

function toThanaStaffDto(row: Record<string, any>) {
  return {
    id: row.id,
    pno: row.pno,
    fullName: row.full_name,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    currentPosting: row.current_posting,
  };
}

/**
 * Read-only Beat/Chowki directory — चौकी/हल्का → गाँव/मोहल्ले → posted SI(s),
 * built from the बीट आबन्टन and नक्शा नौकरी reference tables.
 */
export const listChowkis = asyncHandler(async (_req: Request, res: Response) => {
  const [chowkisRes, villagesRes, officersRes, beatsRes] = await Promise.all([
    supabaseAdmin.from("chowkis").select("*").order("display_order", { ascending: true }),
    supabaseAdmin.from("chowki_villages").select("*").order("display_order", { ascending: true }),
    supabaseAdmin.from("chowki_officers").select("*").order("display_order", { ascending: true }),
    supabaseAdmin.from("beats").select("*").order("display_order", { ascending: true }),
  ]);

  if (chowkisRes.error) throw new HttpError(400, chowkisRes.error.message);
  if (villagesRes.error) throw new HttpError(400, villagesRes.error.message);
  if (officersRes.error) throw new HttpError(400, officersRes.error.message);
  if (beatsRes.error) throw new HttpError(400, beatsRes.error.message);

  const chowkis = (chowkisRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as "chowki" | "halka" | "special",
    policeStation: row.police_station,
    district: row.district,
    inCharge: row.in_charge_name
      ? { name: row.in_charge_name, designation: row.in_charge_designation, phone: row.in_charge_phone }
      : null,
    villages: (villagesRes.data ?? []).filter((v) => v.chowki_id === row.id).map(toChowkiVillageDto),
    officers: (officersRes.data ?? []).filter((o) => o.chowki_id === row.id).map(toChowkiOfficerDto),
    beats: (beatsRes.data ?? []).filter((b) => b.chowki_id === row.id).map(toBeatDto),
  }));

  res.json({ chowkis });
});

/**
 * Read-only Thana-level staff roster, sourced from Karm Yogi portal registrations.
 */
export const listThanaStaff = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("thana_staff")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) throw new HttpError(400, error.message);

  res.json({ staff: (data ?? []).map(toThanaStaffDto) });
});
