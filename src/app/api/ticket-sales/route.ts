import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { computeProfitVnd } from "@/lib/ticket-profit";
import { createInAppNotificationsForUsers } from "@/lib/in-app-notifications";
import { writeAuditLog } from "@/lib/audit";

const TICKET_ROLES = ["director", "chief_manager", "manager", "accountant"];
const TICKET_DISPATCH_VIEW_ROLES = [
  "director",
  "chief_manager",
  "manager",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

const bodySchema = z.object({
  templateId: z.string().uuid(),
  qty: z.number().int().min(1).max(999),
});

function startOfTodayUtcForOffset(offsetMinutes: number): Date {
  const now = new Date();
  const localMs = now.getTime() + offsetMinutes * 60_000;
  const local = new Date(localMs);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMinutes * 60_000);
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!TICKET_DISPATCH_VIEW_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const now = new Date();
  const hourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayStartIso = startOfTodayUtcForOffset(7 * 60).toISOString();

  const { data: recentRows, error: recentErr } = await supabase
    .from("ticket_sales")
    .select(
      "id,qty,sale_total_vnd,manager_profit_vnd,sold_at,template:ticket_templates(name,ticket_type),manager:users(full_name,phone)",
    )
    .order("sold_at", { ascending: false })
    .limit(100);
  if (recentErr) return NextResponse.json({ error: recentErr.message || "Не удалось загрузить продажи" }, { status: 500 });

  const hourRes = await supabase
    .from("ticket_sales")
    .select("qty,manager_id")
    .gte("sold_at", hourAgoIso);
  const dayRes = await supabase
    .from("ticket_sales")
    .select("qty,manager_id")
    .gte("sold_at", dayStartIso);

  type SaleAggRow = { qty: number | string | null; manager_id: string | null };
  const hourRows = (hourRes.data as SaleAggRow[] | null) ?? [];
  const dayRows = (dayRes.data as SaleAggRow[] | null) ?? [];
  const managerIds = [...new Set([...hourRows, ...dayRows].map((r) => String(r.manager_id || "")).filter(Boolean))];
  const managerNameById = new Map<string, string>();
  if (managerIds.length > 0) {
    const u = await supabase.from("users").select("id,full_name").in("id", managerIds);
    for (const row of ((u.data as { id: string; full_name: string }[] | null) ?? [])) {
      managerNameById.set(String(row.id), String(row.full_name || "Менеджер"));
    }
  }

  const bucket = (
    rows: SaleAggRow[],
  ): Array<{ managerId: string; managerName: string; soldQty: number }> => {
    const byManager = new Map<string, number>();
    for (const r of rows) {
      const mid = String(r.manager_id || "");
      if (!mid) continue;
      const qty = Math.max(0, Number(r.qty || 0));
      byManager.set(mid, (byManager.get(mid) || 0) + qty);
    }
    return [...byManager.entries()]
      .map(([managerId, soldQty]) => ({
        managerId,
        managerName: managerNameById.get(managerId) ?? "Менеджер",
        soldQty,
      }))
      .sort((a, b) => b.soldQty - a.soldQty);
  };

  return NextResponse.json({
    nowIso: now.toISOString(),
    soldLastHourByManager: bucket(hourRows),
    soldTodayByManager: bucket(dayRows),
    recentSales: ((recentRows as Record<string, unknown>[] | null) ?? []).map((r) => {
      const tpl = (r.template as { name?: string; ticket_type?: string } | null) ?? null;
      const mgr = (r.manager as { full_name?: string; phone?: string | null } | null) ?? null;
      return {
        id: String(r.id || ""),
        soldAt: String(r.sold_at || ""),
        qty: Math.max(0, Number(r.qty || 0)),
        saleTotalVnd: Math.round(Number(r.sale_total_vnd || 0)),
        managerProfitVnd: Math.round(Number(r.manager_profit_vnd || 0)),
        templateName: String(tpl?.name || ""),
        ticketType: String(tpl?.ticket_type || ""),
        managerName: String(mgr?.full_name || "Менеджер"),
        managerPhone: typeof mgr?.phone === "string" ? mgr.phone : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!TICKET_ROLES.includes(session.role)) {
    return apiDenied();
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json(
      { error: "Нужен вход под пользователем из Supabase (UUID), не демо admin." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { templateId, qty } = parsed.data;

  const { data: tpl, error: tplErr } = await supabase
    .from("ticket_templates")
    .select(
      "id,name,sale_price_vnd,active,ticket_type,office_profit_mode,office_profit_value,manager_profit_mode,manager_profit_value",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (tplErr || !tpl) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  const t = tpl as {
    name?: string;
    sale_price_vnd: number;
    active: boolean;
    ticket_type?: string;
    office_profit_mode: string;
    office_profit_value: number;
    manager_profit_mode: string;
    manager_profit_value: number;
  };
  if (!t.active) return NextResponse.json({ error: "Шаблон отключён" }, { status: 400 });

  const saleTotalVnd = Math.round(Number(t.sale_price_vnd) * qty);
  const officeProfitVnd = computeProfitVnd(
    t.office_profit_mode as "fixed" | "percent",
    Number(t.office_profit_value),
    saleTotalVnd,
    qty,
  );
  const managerProfitVnd = computeProfitVnd(
    t.manager_profit_mode as "fixed" | "percent",
    Number(t.manager_profit_value),
    saleTotalVnd,
    qty,
  );

  const { data: ins, error: insErr } = await supabase
    .from("ticket_sales")
    .insert([
      {
        template_id: templateId,
        manager_id: session.id,
        qty,
        sale_total_vnd: saleTotalVnd,
        office_profit_vnd: officeProfitVnd,
        manager_profit_vnd: managerProfitVnd,
      },
    ])
    .select("id")
    .single();

  if (insErr || !ins) return NextResponse.json({ error: insErr?.message || "Insert failed" }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "ticket_sale",
    entityId: (ins as { id: string }).id,
    action: "create",
    after: { template_id: templateId, qty, sale_total_vnd: saleTotalVnd },
  });

  // Уведомление диспетчеру при продаже любого типа билетов
  try {
    const { data: dispRows } = await supabase.from("users").select("id").in("role", ["dispatcher", "booking_dispatcher"]);
    const dispIds = ((dispRows as { id?: string }[] | null) ?? []).map((r) => String(r.id || "")).filter(Boolean);
    if (dispIds.length > 0) {
      const mgrName = session.fullName.trim() || "Менеджер";
      const ticketName = String(t.name || t.ticket_type || "Билеты");
      await createInAppNotificationsForUsers(supabase, dispIds, {
        kind: "ticket_sale_dispatcher",
        title: `Продажа: ${ticketName}`,
        body: `${mgrName} — ${qty} шт. Отправьте билеты оперативно.`,
        linkUrl: "/tickets",
        meta: { saleId: (ins as { id: string }).id, managerId: session.id, managerName: mgrName, qty, ticketType: t.ticket_type, ticketName },
      });
    }
  } catch {
    /* не блокируем продажу */
  }

  return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
}
