import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isUuidSessionUser } from "@/lib/actor-id";

const ALLOWED_ROLES = ["director", "chief_manager", "manager", "accountant"];

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role)) return apiDenied();
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ sales: [] });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase
    .from("ticket_sales")
    .select("id,qty,sale_total_vnd,manager_profit_vnd,sold_at,template:ticket_templates(name,ticket_type)")
    .eq("manager_id", session.id)
    .order("sold_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    sales: ((data as Record<string, unknown>[] | null) ?? []).map((r) => {
      const tpl = (r.template as { name?: string; ticket_type?: string } | null) ?? null;
      return {
        id: String(r.id || ""),
        soldAt: String(r.sold_at || ""),
        qty: Math.max(0, Number(r.qty || 0)),
        saleTotalVnd: Math.round(Number(r.sale_total_vnd || 0)),
        managerProfitVnd: Math.round(Number(r.manager_profit_vnd || 0)),
        templateName: String(tpl?.name || ""),
        ticketType: String(tpl?.ticket_type || ""),
      };
    }),
  });
}
