import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encodeSession, getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const loginSchema = z
  .string()
  .min(2, "Логин не короче 2 символов")
  .max(80)
  .regex(/^[a-zA-Z0-9._@-]+$/, "Логин: латиница, цифры, . _ @ -");

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const bodySchema = z
  .object({
    fullName: z.string().min(2).max(200).optional(),
    password: z.string().min(1).max(200).optional(),
    login: loginSchema.optional(),
    avatarUrl: z.union([z.literal(""), z.string().max(8192)]).optional(),
    phone: z.union([z.literal(""), z.string().max(40)]).optional(),
  })
  .refine(
    (d) =>
      d.fullName !== undefined ||
      d.password !== undefined ||
      d.login !== undefined ||
      d.avatarUrl !== undefined ||
      d.phone !== undefined,
    { message: "Укажите имя, логин, телефон, ссылку на аватар и/или пароль" },
  )
  .superRefine((d, ctx) => {
    if (d.avatarUrl !== undefined && d.avatarUrl.trim() !== "" && !isValidHttpUrl(d.avatarUrl.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Нужна корректная ссылка http(s) на изображение",
        path: ["avatarUrl"],
      });
    }
    if (d.phone !== undefined && d.phone !== "") {
      const digits = d.phone.replace(/\D/g, "");
      if (digits.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "В номере должно быть не меньше 8 цифр (код страны и номер)",
          path: ["phone"],
        });
      }
    }
  });

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json(
      { error: "Демо-вход не обновляет профиль. Войдите под пользователем из Supabase (UUID в users)." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен (.env.local)." }, { status: 500 });

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: existing } = await supabase.from("users").select("id,login").eq("id", session.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Пользователь не найден в базе" }, { status: 404 });
  }

  if (existing.login === "test" && (parsed.data.password !== undefined || parsed.data.login !== undefined)) {
    return NextResponse.json({ error: "Для демо-аккаунта смена пароля и логина недоступна" }, { status: 403 });
  }

  if (parsed.data.login !== undefined) {
    const wanted = parsed.data.login.trim();
    const rpc = await supabase.rpc("users_login_taken_by_other", {
      p_login: wanted,
      p_exclude_id: session.id,
    });
    let taken = rpc.data === true;
    if (
      rpc.error &&
      /users_login_taken_by_other|does not exist|42883|schema cache/i.test(String(rpc.error.message ?? ""))
    ) {
      const { data: dup } = await supabase
        .from("users")
        .select("id")
        .eq("login", wanted)
        .neq("id", session.id)
        .maybeSingle();
      taken = Boolean(dup);
    } else if (rpc.error) {
      return NextResponse.json({ error: rpc.error.message }, { status: 500 });
    }
    if (taken) {
      return NextResponse.json({ error: "Этот логин уже занят другим пользователем" }, { status: 409 });
    }
  }

  const patch: {
    full_name?: string;
    password?: string;
    login?: string;
    avatar_url?: string | null;
    phone?: string | null;
  } = {};
  if (parsed.data.fullName !== undefined) patch.full_name = parsed.data.fullName;
  if (parsed.data.password !== undefined) patch.password = parsed.data.password;
  if (parsed.data.login !== undefined) patch.login = parsed.data.login;
  if (parsed.data.avatarUrl !== undefined) {
    patch.avatar_url = parsed.data.avatarUrl === "" ? null : parsed.data.avatarUrl.trim();
  }
  if (parsed.data.phone !== undefined) {
    const t = parsed.data.phone.trim();
    patch.phone = t === "" ? null : t;
  }

  const { error } = await supabase.from("users").update(patch).eq("id", session.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nextName = parsed.data.fullName ?? session.fullName;
  let nextAvatar = session.avatarUrl;
  if (parsed.data.avatarUrl !== undefined) {
    const t = parsed.data.avatarUrl.trim();
    nextAvatar = t === "" ? null : t;
  }

  const jar = await cookies();
  jar.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession({ id: session.id, fullName: nextName, role: session.baseRole, avatarUrl: nextAvatar }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, fullName: nextName, avatarUrl: nextAvatar ?? null });
}
