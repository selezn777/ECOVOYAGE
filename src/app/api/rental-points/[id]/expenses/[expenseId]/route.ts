import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z
  .object({
    action: z.enum(["approve", "reject", "mark_issued", "mark_unissued"]),
    reason: z.string().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "reject" && !v.reason?.trim()) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Укажите причину отказа." });
    }
  });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const canReview = session.role === "accountant" || session.role === "director";
  if (!canReview) return NextResponse.json({ error: "Только бухгалтерия или директор." }, { status: 403 });
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id: pointId, expenseId } = await ctx.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const sel = await supabase
    .from("rental_point_expenses")
    .select("id,point_id,approval_status,title,amount_vnd,note,attachment_url,issued_at")
    .eq("id", expenseId)
    .maybeSingle();
  if (sel.error || !sel.data) return NextResponse.json({ error: "Заявка не найдена." }, { status: 404 });
  if (String((sel.data as { point_id?: string | null }).point_id ?? "") !== pointId) {
    return NextResponse.json({ error: "Заявка не относится к этой точке." }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const { action, reason } = parsed.data;
  if (action === "approve") {
    patch.approval_status = "approved";
    patch.approval_note = reason?.trim() || null;
    patch.approved_at = now;
    patch.approved_by = actorId;
  } else if (action === "reject") {
    patch.approval_status = "rejected";
    patch.approval_note = reason?.trim() || null;
    patch.approved_at = now;
    patch.approved_by = actorId;
    patch.issued_at = null;
    patch.issued_by = null;
  } else if (action === "mark_issued") {
    patch.issued_at = now;
    patch.issued_by = actorId;
    patch.approval_status = "approved";
  } else if (action === "mark_unissued") {
    patch.issued_at = null;
    patch.issued_by = null;
  }

  const upd = await supabase.from("rental_point_expenses").update(patch).eq("id", expenseId);
  if (upd.error) {
    if (/approval_status|approval_note|approved_at|issued_at|column|does not exist/i.test(String(upd.error.message))) {
      return NextResponse.json({ error: "Примените миграцию заявок по расходам точки." }, { status: 503 });
    }
    return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }

  if (action === "mark_issued") {
    const exp = sel.data as {
      id: string;
      title?: string | null;
      amount_vnd?: number | string | null;
      note?: string | null;
      attachment_url?: string | null;
      issued_at?: string | null;
    };
    const alreadyIssued = exp.issued_at != null && String(exp.issued_at).trim() !== "";
    // Создаём расход в кассе только при первом "Выдано".
    if (!alreadyIssued) {
      const amountVnd = Math.max(0, Math.round(Number(exp.amount_vnd || 0)));
      if (amountVnd > 0) {
        const title = `Расход по аренде точки: ${String(exp.title || "без названия").trim()}`;
        const note = [String(exp.note || "").trim(), `Заявка расхода точки #${expenseId}`].filter(Boolean).join(" · ");
        const baseRow: Record<string, unknown> = {
          direction: "out",
          amount_vnd: amountVnd,
          title,
          note: note || null,
          attachment_url: exp.attachment_url ?? null,
          created_by: actorId,
          rental_point_id: pointId,
          currency_code: "VND",
          payment_kind: "cash",
          amount_foreign: null,
          fx_rate_to_vnd: null,
          ledger_bucket: "standard",
          ledger_bucket_ok_at: now,
          ledger_bucket_ok_by: actorId,
        };

        let { error: insErr } = await supabase.from("cash_manual_ledger_entries").insert([baseRow]);
        if (insErr && /ledger_bucket|column|does not exist/i.test(String(insErr.message))) {
          const legacy = { ...baseRow };
          delete legacy.ledger_bucket;
          delete legacy.ledger_bucket_ok_at;
          delete legacy.ledger_bucket_ok_by;
          ({ error: insErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
        }
        if (insErr && /rental_point_id|column|does not exist/i.test(String(insErr.message))) {
          const legacy = { ...baseRow };
          delete legacy.rental_point_id;
          ({ error: insErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
        }
        if (insErr && /currency_code|payment_kind|amount_foreign|fx_rate_to_vnd|column|does not exist/i.test(String(insErr.message))) {
          const legacy = { ...baseRow };
          delete legacy.currency_code;
          delete legacy.payment_kind;
          delete legacy.amount_foreign;
          delete legacy.fx_rate_to_vnd;
          ({ error: insErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
        }
        if (insErr && /attachment_url|column|does not exist/i.test(String(insErr.message))) {
          const legacy = { ...baseRow };
          delete legacy.attachment_url;
          ({ error: insErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
        }
        if (insErr && /cash_manual_ledger_entries|relation|does not exist/i.test(String(insErr.message))) {
          return NextResponse.json({ error: "Выполните миграцию БД: cash_manual_ledger_entries." }, { status: 503 });
        }
        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
