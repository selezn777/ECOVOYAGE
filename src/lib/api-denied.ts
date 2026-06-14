import { NextResponse } from "next/server";

/** Нет прав: как у несуществующего ресурса, без намёка на запрет */
export function apiDenied() {
  return NextResponse.json({ error: "Не найдено" }, { status: 404 });
}
