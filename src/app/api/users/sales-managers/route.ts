import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { listSalesManagers } from "@/lib/data";
import { canCreateBooking, canAssignBookingManager } from "@/lib/role-policy";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role)) {
    return apiDenied();
  }
  if (!canAssignBookingManager(session.role)) {
    return NextResponse.json({ managers: [] });
  }
  const managers = await listSalesManagers();
  return NextResponse.json({ managers });
}
