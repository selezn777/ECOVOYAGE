import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush } from "@/lib/push-server";
import type { Role } from "@/lib/types";
import { announcementRecipientsPreset } from "@/lib/staff-announcements-policy";

export type InAppNotificationKind =
  | "announcement"
  | "guide_assigned"
  | "manager_point_assigned"
  | "tour_created_dispatcher"
  | "ticket_sale_vinwonders_dispatcher"
  | "ticket_sale_dispatcher";

export type InsertInAppNotificationInput = {
  kind: InAppNotificationKind;
  title: string;
  body: string;
  linkUrl?: string | null;
  meta?: Record<string, unknown>;
};

const BATCH = 80;

async function fetchUserIdsByRoles(
  supabase: SupabaseClient,
  roles: Role[],
): Promise<string[]> {
  if (!roles.length) return [];
  const uniq = [...new Set(roles)];
  const { data, error } = await supabase.from("users").select("id").in("role", uniq);
  if (error) throw new Error(error.message);
  const rows = (data as { id: string }[] | null) ?? [];
  return rows.map((r) => String(r.id)).filter(Boolean);
}

/** Все сотрудники с учётной ролью из приложения (для «Всем» у директора). */
export async function fetchAllStaffUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("users").select("id,role");
  if (error) throw new Error(error.message);
  const valid = new Set<string>(
    ["director", "chief_manager", "chief_guide", "manager", "guide", "accountant", "dispatcher", "booking_dispatcher"],
  );
  return (
    ((data as { id?: string; role?: string }[] | null) ?? [])
      .filter((r) => r?.id && r.role && valid.has(String(r.role)))
      .map((r) => String(r.id))
  );
}

export async function resolveAnnouncementRecipientIds(
  supabase: SupabaseClient,
  params: {
    senderBaseRole: Role;
    directorAudience?: "all" | "custom";
    directorRoles?: Role[];
  },
): Promise<string[]> {
  const preset = announcementRecipientsPreset(params.senderBaseRole);
  if (preset === "director_choice") {
    if (params.directorAudience === "all") return fetchAllStaffUserIds(supabase);
    const roles = params.directorRoles ?? [];
    return fetchUserIdsByRoles(supabase, roles);
  }
  return fetchUserIdsByRoles(supabase, preset);
}

function webPushEnvReady(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

async function sendPushBestEffort(
  supabase: SupabaseClient,
  userIds: string[],
  payload: { title: string; body?: string; url?: string },
): Promise<void> {
  if (!webPushEnvReady()) return;
  if (!userIds.length) return;
  const unique = [...new Set(userIds)];
  const subs: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", chunk)
      .eq("enabled", true);
    if (error) return;
    subs.push(...(((data as typeof subs | null) ?? [])));
  }
  for (const s of subs) {
    try {
      await sendWebPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title: payload.title, body: payload.body, url: payload.url },
      );
    } catch (e) {
      const message = String((e as { message?: unknown })?.message ?? "");
      if (message.includes("410") || message.includes("404")) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
}

export async function createInAppNotificationsForUsers(
  supabase: SupabaseClient,
  userIds: string[],
  input: InsertInAppNotificationInput,
  options?: { push?: boolean },
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;

  const rows = ids.map((user_id) => ({
    user_id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link_url: input.linkUrl ?? null,
    meta: input.meta ?? {},
  }));

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("in_app_notifications").insert(chunk);
    if (error) {
      if (/in_app_notifications|does not exist/i.test(String(error.message))) {
        throw new Error("Выполните миграцию БД: in_app_notifications.");
      }
      throw new Error(error.message);
    }
  }

  if (options?.push !== false) {
    await sendPushBestEffort(supabase, ids, {
      title: input.title,
      body: input.body.slice(0, 180),
      url: input.linkUrl || undefined,
    });
  }
}
