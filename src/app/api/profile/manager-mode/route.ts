import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, MANAGER_MODE_COOKIE_NAME } from "@/lib/auth-session";

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const base = session.baseRole;
  if (base !== "guide" && base !== "chief_guide") {
    return NextResponse.json({ error: "Режим менеджера доступен только для аккаунта гида" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, enabled: parsed.data.enabled });
  res.cookies.set({
    name: MANAGER_MODE_COOKIE_NAME,
    value: parsed.data.enabled ? "1" : "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: parsed.data.enabled ? 60 * 60 * 24 * 7 : 0,
  });
  return res;
}
