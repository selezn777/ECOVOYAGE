import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DIRECTOR_VIEW_AS_COOKIE_NAME,
  DIRECTOR_VIEW_AS_ROLES,
  getSessionUser,
  isDemoUser,
} from "@/lib/auth-session";

const viewAsSchema = z.enum(["chief_manager", "manager", "chief_guide", "guide", "dispatcher", "booking_dispatcher", "accountant"]);

const bodySchema = z.object({
  as: viewAsSchema.nullable(),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.baseRole !== "director" && !isDemoUser(session)) {
    return NextResponse.json({ error: "Доступно только директору" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const { as } = parsed.data;
  const res = NextResponse.json({ ok: true });

  if (as === null) {
    res.cookies.set({
      name: DIRECTOR_VIEW_AS_COOKIE_NAME,
      value: "",
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  } else {
    if (!DIRECTOR_VIEW_AS_ROLES.includes(as)) {
      return NextResponse.json({ error: "Недопустимая роль" }, { status: 400 });
    }
    res.cookies.set({
      name: DIRECTOR_VIEW_AS_COOKIE_NAME,
      value: as,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}
