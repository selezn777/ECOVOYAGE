import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listTicketTemplates } from "@/lib/data";

const TICKET_ROLES = ["director", "chief_manager", "manager", "accountant"];
const ADMIN_ROLES = ["director", "chief_manager"];

const createSchema = z.object({
  ticketType: z.enum(["vinwonders", "teatro_do"]),
  name: z.string().min(1).max(200),
  salePriceVnd: z.number().int().min(0),
  officeProfitMode: z.enum(["fixed", "percent"]),
  officeProfitValue: z.number().min(0).max(100000000),
  managerProfitMode: z.enum(["fixed", "percent"]),
  managerProfitValue: z.number().min(0).max(100000000),
});

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!TICKET_ROLES.includes(session.role)) return apiDenied();

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true" && ADMIN_ROLES.includes(session.role);

  if (all) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
    const { data, error } = await supabase
      .from("ticket_templates")
      .select("id,name,ticket_type,sale_price_vnd,office_profit_mode,office_profit_value,manager_profit_mode,manager_profit_value,active")
      .order("ticket_type")
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
  }

  const templates = await listTicketTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ticketType, name, salePriceVnd, officeProfitMode, officeProfitValue, managerProfitMode, managerProfitValue } = parsed.data;

  const { data, error } = await supabase
    .from("ticket_templates")
    .insert([{
      ticket_type: ticketType,
      name,
      sale_price_vnd: salePriceVnd,
      office_profit_mode: officeProfitMode,
      office_profit_value: officeProfitValue,
      manager_profit_mode: managerProfitMode,
      manager_profit_value: managerProfitValue,
      active: true,
    }])
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
