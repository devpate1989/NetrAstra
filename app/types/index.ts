export type UserRole = "io" | "sho" | "admin";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  policeStation?: string | null;
  district?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface StationPersonnel {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  policeStation?: string | null;
  district?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface ChowkiOfficer {
  id: string;
  fullName: string;
  designation: string;
  phone?: string | null;
  pno?: string | null;
}

export interface ChowkiVillage {
  id: string;
  villageName: string;
  beatNumber?: string | null;
}

export interface Beat {
  id: string;
  beatNumber?: string | null;
  si: { name: string; phone?: string | null; pno?: string | null } | null;
  staff: { name: string; phone?: string | null } | null;
  linkOfficer: { name: string; phone?: string | null } | null;
}

export interface Chowki {
  id: string;
  name: string;
  kind: "chowki" | "halka" | "special";
  policeStation?: string | null;
  district?: string | null;
  inCharge: { name: string; designation?: string | null; phone?: string | null } | null;
  villages: ChowkiVillage[];
  officers: ChowkiOfficer[];
  beats: Beat[];
}

export interface ThanaStaff {
  id: string;
  pno?: string | null;
  fullName: string;
  designation?: string | null;
  phone?: string | null;
  email?: string | null;
  currentPosting?: string | null;
}
