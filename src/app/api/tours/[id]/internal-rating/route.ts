import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Внутренний рейтинг тура отключен." }, { status: 404 });
}
