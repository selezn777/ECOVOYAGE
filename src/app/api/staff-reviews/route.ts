import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { isUuidSessionUser } from "@/lib/actor-id";
import { listStaffReviewsForSubject } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canAddGuideReview, canAddManagerReview } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

const postSchema = z.object({
  kind: z.enum(["guide", "manager"]),
  subjectId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(4000).optional(),
  attachmentUrl: z.union([z.literal(""), z.string().max(2000)]).optional(),
});

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get("subjectId");
  const kind = searchParams.get("kind");
  if (!subjectId || !/^[0-9a-f-]{36}$/i.test(subjectId)) {
    return NextResponse.json({ error: "Укажите subjectId (uuid)" }, { status: 400 });
  }
  if (kind !== "guide" && kind !== "manager") {
    return NextResponse.json({ error: "kind: guide или manager" }, { status: 400 });
  }
  const reviews = await listStaffReviewsForSubject(kind, subjectId);
  return NextResponse.json({ reviews });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Демо-вход не добавляет отзывы" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: subj, error: se } = await supabase
    .from("users")
    .select("id,role")
    .eq("id", parsed.data.subjectId)
    .eq("is_active", true)
    .maybeSingle();
  if (se || !subj) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (parsed.data.subjectId === session.id) {
    return NextResponse.json({ error: "Нельзя оставить отзыв самому себе" }, { status: 400 });
  }
  const role = subj.role as Role;

  if (parsed.data.kind === "guide") {
    if (role !== "guide" && role !== "chief_guide") {
      return NextResponse.json({ error: "Отзыв «гид» только для роли гида" }, { status: 400 });
    }
    if (!canAddGuideReview(session.role)) {
      return NextResponse.json({ error: "Нет права добавлять отзыв гиду" }, { status: 403 });
    }
  } else {
    if (role !== "manager" && role !== "chief_manager") {
      return NextResponse.json({ error: "Отзыв «менеджер» только для роли менеджера" }, { status: 400 });
    }
    if (!canAddManagerReview(session.role)) {
      return NextResponse.json({ error: "Нет права добавлять отзыв менеджеру" }, { status: 403 });
    }
  }

  const url = parsed.data.attachmentUrl?.trim() || null;
  if (url && url !== "") {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return NextResponse.json({ error: "Некорректная ссылка на вложение" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Некорректная ссылка на вложение" }, { status: 400 });
    }
  }

  const table = parsed.data.kind === "guide" ? "guide_reviews" : "manager_reviews";
  const fk = parsed.data.kind === "guide" ? "guide_id" : "manager_id";
  const row = {
    [fk]: parsed.data.subjectId,
    author_id: session.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment?.trim() || null,
    attachment_url: url && url !== "" ? url : null,
  };

  const { error } = await supabase.from(table).insert(row);
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Таблицы отзывов нет. Выполните migration_staff_feedback.sql в Supabase." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
