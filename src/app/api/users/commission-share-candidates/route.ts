import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canCreateBooking, FINANCE_ROLES } from "@/lib/role-policy";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role) && !FINANCE_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase
    .from("users")
    .select("id,full_name,role,is_active")
    .eq("is_active", true)
    .order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = ((data as { id: string; full_name: string; role: string; is_active: boolean }[]) || []).map((u) => ({
    id: u.id,
    fullName: u.full_name,
    role: u.role,
  }));
  return NextResponse.json({ users });
}

