import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isUuidSessionUser } from "@/lib/actor-id";
import {
  createInAppNotificationsForUsers,
  resolveAnnouncementRecipientIds,
} from "@/lib/in-app-notifications";
import { canSendStaffAnnouncement } from "@/lib/staff-announcements-policy";
import type { Role } from "@/lib/types";

const directorTargetRoleSchema = z.enum([
  "chief_manager",
  "chief_guide",
  "manager",
  "guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
]);

const directorSchema = z.object({
  title: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(12000),
  audience: z.enum(["all", "custom"]),
  roles: z.array(directorTargetRoleSchema).optional(),
});

const simpleSchema = z.object({
  title: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(12000),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен вход под пользователем из Supabase (UUID)." }, { status: 400 });
  }

  const baseRole = session.baseRole;
  if (!canSendStaffAnnouncement(baseRole)) {
    return NextResponse.json({ error: "Нет права отправлять объявления." }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  let title = "";
  let body = "";
  let directorAudience: "all" | "custom" | undefined;
  let directorRoles: Role[] | undefined;

  if (baseRole === "director") {
    const parsed = directorSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    title = (parsed.data.title || "").trim();
    body = parsed.data.body.trim();
    directorAudience = parsed.data.audience;
    if (parsed.data.audience === "custom") {
      const rs = parsed.data.roles ?? [];
      if (!rs.length) return NextResponse.json({ error: "Выберите хотя бы одну роль." }, { status: 400 });
      directorRoles = rs as Role[];
    }
  } else {
    const parsed = simpleSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    title = (parsed.data.title || "").trim();
    body = parsed.data.body.trim();
  }

  let recipientIds: string[];
  try {
    recipientIds = await resolveAnnouncementRecipientIds(supabase, {
      senderBaseRole: baseRole,
      directorAudience,
      directorRoles,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка получателей" }, { status: 500 });
  }

  recipientIds = recipientIds.filter((id) => id !== session.id);
  if (!recipientIds.length) {
    return NextResponse.json({ error: "Нет получателей для этого объявления." }, { status: 400 });
  }

  const displayTitle = title || "Объявление руководства";

  try {
    await createInAppNotificationsForUsers(supabase, recipientIds, {
      kind: "announcement",
      title: displayTitle,
      body,
      linkUrl: null,
      meta: {
        authorId: session.id,
        authorName: session.fullName,
        authorRole: baseRole,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recipients: recipientIds.length });
}
