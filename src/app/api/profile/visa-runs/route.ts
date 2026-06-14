import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const postSchema = z.object({
  mode: z.enum(["manager", "guide"]),
  cycleDays: z.union([z.literal(45), z.literal(90)]),
  dayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const delSchema = z.object({
  id: z.string().uuid(),
});

function roleAllowsMode(
  role: string,
  mode: "manager" | "guide",
): boolean {
  if (mode === "manager") return role === "manager" || role === "chief_manager";
  return role === "guide" || role === "chief_guide";
}

function expandDays(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase
    .from("employee_visa_runs")
    .select("id,staff_mode,cycle_days,day_from,day_to,created_at")
    .eq("user_id", session.id)
    .order("day_from", { ascending: true });
  if (error) {
    if (/employee_visa_runs|does not exist|relation/i.test(String(error.message))) {
      return NextResponse.json({ rows: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    rows: ((data as {
      id: string;
      staff_mode: "manager" | "guide";
      cycle_days: 45 | 90;
      day_from: string;
      day_to: string;
      created_at: string;
    }[] | null) ?? []).map((r) => ({
      id: r.id,
      mode: r.staff_mode,
      cycleDays: Number(r.cycle_days),
      dayFrom: String(r.day_from).slice(0, 10),
      dayTo: String(r.day_to).slice(0, 10),
      createdAt: r.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { mode, cycleDays, dayFrom, dayTo } = parsed.data;
  if (!roleAllowsMode(session.role, mode)) {
    return NextResponse.json({ error: "Режим не соответствует вашей роли." }, { status: 403 });
  }
  const from = dayFrom <= dayTo ? dayFrom : dayTo;
  const to = dayFrom <= dayTo ? dayTo : dayFrom;
  const days = expandDays(from, to);
  if (days.length < 2 || days.length > 3) {
    return NextResponse.json({ error: "Для виза-рана допустим диапазон 2-3 дня." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const ins = await supabase
    .from("employee_visa_runs")
    .insert([
      {
        user_id: session.id,
        staff_mode: mode,
        cycle_days: cycleDays,
        day_from: from,
        day_to: to,
        created_by: session.id,
      },
    ])
    .select("id")
    .single();
  if (ins.error) {
    if (/employee_visa_runs|does not exist|relation/i.test(String(ins.error.message))) {
      return NextResponse.json({ error: "Нужно применить миграции базы данных." }, { status: 400 });
    }
    return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (ins.data as { id: string }).id });
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const url = new URL(request.url);
  const parsed = delSchema.safeParse({ id: url.searchParams.get("id") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const del = await supabase
    .from("employee_visa_runs")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", session.id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
