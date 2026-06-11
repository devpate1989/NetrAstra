import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),
  appUrl: optional("APP_URL", "http://localhost:3000"),
  apiBaseUrl: optional("API_BASE_URL", "http://localhost:4000"),

  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  claudeApiKey: optional("CLAUDE_API_KEY"),

  resendApiKey: optional("RESEND_API_KEY"),
  emailFrom: optional("EMAIL_FROM", "App <noreply@example.com>"),

  cctnsPortalUrl: optional("CCTNS_PORTAL_URL"),
  cctnsUsername: optional("CCTNS_USERNAME"),
  cctnsPassword: optional("CCTNS_PASSWORD"),
  cctnsZoneId: optional("CCTNS_ZONE_ID"),
  cctnsRangeId: optional("CCTNS_RANGE_ID"),
  cctnsDistrictId: optional("CCTNS_DISTRICT_ID"),
  cctnsPsId: optional("CCTNS_PS_ID"),

  jansunwaiPortalUrl: optional("JANSUNWAI_PORTAL_URL"),
  jansunwaiUsername: optional("JANSUNWAI_USERNAME"),
  jansunwaiPassword: optional("JANSUNWAI_PASSWORD"),

  policeStationName: optional("POLICE_STATION_NAME"),
  policeDistrictName: optional("POLICE_DISTRICT_NAME"),
};
