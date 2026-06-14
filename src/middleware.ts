import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEMO_LOGIN } from "@/lib/auth-session";

function getSessionLogin(req: NextRequest): string | null {
  const cookie = req.cookies.get("amx_session_v2")?.value;
  if (!cookie) return null;
  try {
    const payload = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof payload.login === "string" ? payload.login : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const login = getSessionLogin(req);
  if (login !== DEMO_LOGIN) return NextResponse.next();

  // Демо-пользователь: разрешаем всё кроме:
  // — удаление/изменение пользователей (команда боевой версии)
  // — сброс системы
  // — создание новых пользователей в боевой команде
  const method = req.method.toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    if (
      pathname.startsWith("/api/admin/") ||
      pathname.startsWith("/api/users/create") ||
      pathname.match(/^\/api\/users\/[^/]+\/(active|role|password)/)
    ) {
      return NextResponse.json({ error: "Демо-режим: действие недоступно" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
