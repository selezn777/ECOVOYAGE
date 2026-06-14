import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { canManageTeamCredentials, canViewEmployeeFinanceCardForTarget } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Role } from "@/lib/types";

const updateSchema = z.object({
  password: z.string().min(4).max(200),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageTeamCredentials(session.role, session.baseRole)) return apiDenied();

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase.from("users").select("id,role,login,password").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });

  const targetRole = String(data.role || "") as Role;
  if (!canViewEmployeeFinanceCardForTarget(session.role, targetRole)) return apiDenied();

  return NextResponse.json({
    ok: true,
    credentials: {
      login: String(data.login ?? ""),
      password: String(data.password ?? ""),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageTeamCredentials(session.role, session.baseRole)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id } = await params;
  const { data: target, error: targetErr } = await supabase.from("users").select("id,role,login").eq("id", id).maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });

  const targetRole = String(target.role || "") as Role;
  if (!canViewEmployeeFinanceCardForTarget(session.role, targetRole)) return apiDenied();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Некорректный пароль" }, { status: 400 });

  const newPassword = parsed.data.password;
  const { error } = await supabase.from("users").update({ password: newPassword }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    credentials: {
      login: String(target.login ?? ""),
      password: newPassword,
    },
  });
}
