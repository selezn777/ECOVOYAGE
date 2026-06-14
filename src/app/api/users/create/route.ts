import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { canCreateTeamAccount } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

const bodySchema = z.object({
  fullName: z.string().min(2).max(200),
  login: z.string().min(2).max(80).regex(/^\S+$/, "Логин без пробелов"),
  password: z.string().min(4).max(200),
  role: z.enum([
    "manager",
    "chief_manager",
    "guide",
    "chief_guide",
    "accountant",
    "dispatcher",
    "booking_dispatcher",
  ]),
});

const DIRECTOR_MANAGER_CREATABLE: Role[] = [
  "manager",
  "chief_manager",
  "guide",
  "chief_guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

function allowedTargetRoles(session: { role: Role; baseRole: Role }): Role[] {
  if (session.baseRole === "director") return DIRECTOR_MANAGER_CREATABLE;
  if (session.role === "chief_guide") return ["guide"];
  if (session.role === "chief_manager") return ["manager"];
  if (session.role === "dispatcher") return ["dispatcher", "booking_dispatcher"];
  return [];
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateTeamAccount(session.role, session.baseRole)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { fullName, login, password, role } = parsed.data;
  const allowed = allowedTargetRoles(session);
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: "Недопустимая роль для вашего аккаунта" }, { status: 400 });
  }

  const { data: created, error: insErr } = await supabase
    .from("users")
    .insert([
      {
        full_name: fullName.trim(),
        login: login.trim(),
        password,
        role,
        is_active: true,
      },
    ])
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ error: "Такой логин уже занят" }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "users",
    entityId: created?.id ?? login,
    action: "create_team_user",
    after: { full_name: fullName, login, role },
  });

  return NextResponse.json({
    ok: true,
    id: created?.id,
    credentials: {
      login,
      password,
    },
  });
}
