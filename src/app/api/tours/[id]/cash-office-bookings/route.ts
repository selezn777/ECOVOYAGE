import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listBookingsForTour } from "@/lib/data";
import { canEditCashLedger } from "@/lib/role-policy";

/** Брони тура с ненулевым долгом — для приёма оплаты в кассе офиса по конкретной брони. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  }
  if (!canEditCashLedger(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: tourId } = await params;
  if (!tourId?.trim()) {
    return NextResponse.json({ error: "Некорректный тур" }, { status: 400 });
  }

  const bookings = await listBookingsForTour(tourId.trim());
  const withDue = bookings.filter((b) => b.dueVnd > 0);

  return NextResponse.json({
    bookings: withDue.map((b) => ({
      id: b.id,
      customerName: b.customerName,
      hotel: b.hotel || "",
      dueVnd: b.dueVnd,
      onlineCode: b.onlineCode,
    })),
  });
}
