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
