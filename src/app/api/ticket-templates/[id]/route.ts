import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ADMIN_ROLES = ["director", "chief_manager"];

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
  salePriceVnd: z.number().int().min(0).optional(),
  officeProfitMode: z.enum(["fixed", "percent"]).optional(),
  officeProfitValue: z.number().min(0).max(100000000).optional(),
  managerProfitMode: z.enum(["fixed", "percent"]).optional(),
  managerProfitValue: z.number().min(0).max(100000000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.role)) return apiDenied();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID не указан" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.salePriceVnd !== undefined) update.sale_price_vnd = parsed.data.salePriceVnd;
  if (parsed.data.officeProfitMode !== undefined) update.office_profit_mode = parsed.data.officeProfitMode;
  if (parsed.data.officeProfitValue !== undefined) update.office_profit_value = parsed.data.officeProfitValue;
  if (parsed.data.managerProfitMode !== undefined) update.manager_profit_mode = parsed.data.managerProfitMode;
  if (parsed.data.managerProfitValue !== undefined) update.manager_profit_value = parsed.data.managerProfitValue;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const { error } = await supabase.from("ticket_templates").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
