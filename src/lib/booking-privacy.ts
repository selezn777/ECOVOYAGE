import type { Booking } from "@/lib/types";

/**
 * Убирает из брони персональные данные туриста для ответа клиенту (RSC payload),
 * чтобы гид без назначения на тур не мог прочитать их из HTML/JSON даже при обходе UI.
 */
export function redactBookingTouristPii(b: Booking): Booking {
  return {
    ...b,
    customerName: "Турист скрыт",
    managerName: "Скрыто",
    phone: "",
    phoneAlt: undefined,
    mapsUrl: "",
    room: "",
    hotel: "",
    adults: 0,
    children: 0,
    infants: 0,
    totalVnd: 0,
    depositVnd: 0,
    topupVnd: 0,
    officeCashVnd: 0,
    paidVnd: 0,
    dueVnd: 0,
    paymentStatus: "unpaid",
    note: undefined,
    priceLines: [],
    telegramUsername: undefined,
    dispatcherBookingPhotoUrl: null,
    passportPhotoUrls: [],
  };
}
