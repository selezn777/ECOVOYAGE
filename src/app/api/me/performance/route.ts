import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { isUuidSessionUser } from "@/lib/actor-id";
import { getUserPerformanceSnapshot } from "@/lib/data";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({
      salesCount: null,
      guideRatingAvg: null,
      guideReviewsCount: null,
      guideTripsCount: null,
      managerRatingAvg: null,
      managerReviewsCount: null,
    });
  }

  const snap = await getUserPerformanceSnapshot(session.id, session.role);
  return NextResponse.json(snap);
}
