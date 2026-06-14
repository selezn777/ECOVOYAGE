import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    actorId: string | null;
    entity: string;
    entityId: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): Promise<void> {
  await supabase.from("audit_logs").insert([
    {
      actor_id: params.actorId,
      entity: params.entity,
      entity_id: params.entityId,
      action: params.action,
      before_data: params.before ?? null,
      after_data: params.after ?? null,
    },
  ]);
}
