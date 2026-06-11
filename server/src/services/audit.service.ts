import { supabaseAdmin } from "../config/supabase";
import { AuthUser } from "../types";

interface LogAuditInput {
  actor: Pick<AuthUser, "id" | "email">;
  action: string;
  targetTable?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Records a sensitive admin/report action for accountability (Phase 10).
 * Best-effort: a logging failure must never block the action it's recording.
 */
export async function logAudit({ actor, action, targetTable, targetId, details }: LogAuditInput): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    actor_id: actor.id,
    actor_username: actor.email.split("@")[0],
    action,
    target_table: targetTable ?? null,
    target_id: targetId ?? null,
    details: details ?? null,
  });

  if (error) {
    console.error("[audit] Could not write audit log entry:", error.message);
  }
}
