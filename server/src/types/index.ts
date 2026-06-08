export type UserRole = "io" | "sho" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  policeStation?: string;
  district?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
