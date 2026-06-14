import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DIRECTOR_VIEW_AS_COOKIE_NAME, encodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { defaultHomePathForRole } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

const payloadSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

const allowedRoles: Role[] = [
  "director",
  "chief_manager",
  "manager",
  "chief_guide",
  "guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

type AuthUser = { id: string; full_name: string; role: Role; avatar_url: string | null; login?: string };

function rpcMissingLoginMatcher(msg: string): boolean {
  return /match_user_by_login_password|does not exist|42883|schema cache/i.test(msg);
}

async function tryAuth(login: string, password: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  const loginTrim = login.trim();
  if (supabase) {
    const rpc = await supabase.rpc("match_user_by_login_password", {
      p_login: loginTrim,
      p_password: password,
    });
    type Row = { id: string; full_name: string; role: string; avatar_url?: string | null };
    let data: Row | null = null;
    if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
      data = rpc.data[0] as Row;
    } else if (rpc.error && rpcMissingLoginMatcher(String(rpc.error.message ?? ""))) {
      const leg = await supabase
        .from("users")
        .select("id,full_name,role,avatar_url")
        .eq("login", loginTrim)
        .eq("password", password)
        .maybeSingle();
      data = leg.data as Row | null;
    }
    if (data && allowedRoles.includes(data.role as Role)) {
      return {
        id: data.id,
        full_name: data.full_name,
        role: data.role as Role,
        avatar_url: data.avatar_url ?? null,
        login: loginTrim,
      };
    }
    return null;
  }
  if (login.toLowerCase() === "admin" && password === "admin") {
    return { id: "demo-director", full_name: "Demo Director", role: "director", avatar_url: null };
  }
  return null;
}

function attachSessionCookie(res: NextResponse, user: AuthUser) {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession({
      id: user.id,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: user.avatar_url,
      login: user.login,
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  res.cookies.set({
    name: DIRECTOR_VIEW_AS_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return res;
}

/**
 * Form POST → редирект 303 на домашнюю страницу роли (бухгалтер → /cash) + Set-Cookie.
 * JSON → { ok: true } + cookie (для скриптов).
 */
export async function POST(request: Request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  const isJson = ct.includes("application/json");
  const origin = new URL(request.url).origin;

  let login = "";
  let password = "";

  if (isJson) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    login = parsed.data.login.trim();
    password = parsed.data.password;
  } else {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.redirect(new URL("/login?err=form", origin), 303);
    }
    login = String(form.get("login") ?? "").trim();
    password = String(form.get("password") ?? "");
    const parsed = payloadSchema.safeParse({ login, password });
    if (!parsed.success) {
      return NextResponse.redirect(new URL("/login?err=form", origin), 303);
    }
    login = parsed.data.login.trim();
    password = parsed.data.password;
  }

  const user = await tryAuth(login, password);
  if (!user) {
    if (isJson) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login?err=auth", origin), 303);
  }

  if (isJson) {
    return attachSessionCookie(NextResponse.json({ ok: true }), user);
  }

  const home = new URL(defaultHomePathForRole(user.role), request.url);
  return attachSessionCookie(NextResponse.redirect(home, 303), user);
}
