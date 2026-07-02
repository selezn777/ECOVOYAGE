import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { requireAuth } from "@/lib/auth-session";
import { getTouristProfileData } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";
import { maskPhone } from "@/lib/tourist-sale-phone";

export const dynamic = "force-dynamic";

const TOURIST_LIST_ROLES = ["director", "chief_manager", "accountant", "manager", "guide", "chief_guide"] as const;
const CAN_DUPLICATE_ROLES = ["director", "chief_manager", "manager"] as const;

function payPill(s: string) {
  if (s === "paid") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800/50";
  if (s === "partial") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800/50";
  return "bg-red-50 text-red-800 ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900/50";
}
function payLabel(s: string) {
  if (s === "paid") return "Оплачено";
  if (s === "partial") return "Частично";
  return "К доплате";
}

export default async function TouristProfilePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const user = await requireAuth();
  if (!(TOURIST_LIST_ROLES as readonly string[]).includes(user.role)) {
    return (
      <main className="app-wrap">
        <TopNav user={user} />
        <div className="card mt-4 py-12 text-center text-[var(--muted)]">Раздел недоступен</div>
      </main>
    );
  }

  const { bookingId } = await params;
  const tourist = await getTouristProfileData(bookingId);
  if (!tourist) notFound();

  const isDirectorLike = user.role === "director" || user.role === "chief_manager" || user.role === "chief_guide";
  const isGuide = user.role === "guide" || user.baseRole === "guide";
  const isManager = user.role === "manager" && !isGuide;
  const phoneVisible =
    isDirectorLike ||
    (isManager && tourist.managerId === user.id) ||
    isGuide;

  const canDuplicate = (CAN_DUPLICATE_ROLES as readonly string[]).includes(user.role);
  const todayYmd = tourBusinessTodayYmd();

  const displayPhone = phoneVisible ? tourist.phone : maskPhone(tourist.phone);
  const waHref = phoneVisible && tourist.phone ? `https://wa.me/${tourist.phone.replace(/[^\d]/g, "")}` : null;
  const tgHref = phoneVisible && tourist.telegramUsername
    ? `tg://msg?to=${encodeURIComponent(tourist.telegramUsername.startsWith("@") ? tourist.telegramUsername : `@${tourist.telegramUsername}`)}`
    : null;

  const totalPaid = tourist.bookings.reduce((s, b) => s + b.paidVnd, 0);
  const totalDue = tourist.bookings.reduce((s, b) => s + b.dueVnd, 0);

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />

      {/* Навигация назад */}
      <div className="mb-3">
        <Link href="/tourists" className="text-sm text-[var(--accent)] hover:underline underline-offset-2">
          ← Туристы
        </Link>
      </div>

      {/* Карточка туриста */}
      <section className="card mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-[var(--text)]">{tourist.customerName}</h1>
            {tourist.hotel ? (
              <p className="mt-0.5 text-sm text-[var(--muted)]">🏨 {tourist.hotel}</p>
            ) : null}
            {tourist.onlineCode ? (
              <p className="mt-0.5 font-mono text-[12px] font-bold text-[var(--accent)]">{tourist.onlineCode}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-xl bg-[var(--surface-soft)] px-3 py-1 text-[12px] font-semibold tabular-nums ring-1 ring-[var(--border)]">
              {tourist.bookings.length} {tourist.bookings.length === 1 ? "тур" : tourist.bookings.length < 5 ? "тура" : "туров"}
            </span>
          </div>
        </div>

        {/* Телефон */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm tabular-nums text-[var(--text)]">{displayPhone || "—"}</span>
          {waHref ? (
            <a href={waHref} target="_blank" rel="noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] text-white"
              aria-label="WhatsApp">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          ) : null}
          {tgHref ? (
            <a href={tgHref}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2AABEE] text-white"
              aria-label="Telegram">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.617l-2.95-.924c-.64-.203-.658-.64.136-.954l11.57-4.461c.537-.194 1.006.131.878.943z"/>
              </svg>
            </a>
          ) : null}
        </div>

        {/* Менеджер */}
        {(isDirectorLike || isManager) && tourist.managerName ? (
          <p className="mt-2 text-[12px] text-[var(--muted2)]">Менеджер: {tourist.managerName}</p>
        ) : null}

        {/* Итоги */}
        {tourist.bookings.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--border)]/60 pt-3 text-[12px]">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
              Оплачено: {formatVnd(totalPaid)}
            </span>
            {totalDue > 0 ? (
              <span className="text-amber-700 dark:text-amber-300 font-medium tabular-nums">
                К доплате: {formatVnd(totalDue)}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* История туров */}
      <section className="card mb-3">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
          История туров · {tourist.bookings.length}
        </h2>

        {tourist.bookings.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Нет броней.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {tourist.bookings.map((bk) => {
              const isPast = bk.tourDate ? bk.tourDate < todayYmd : false;
              const pax = bk.adults + bk.children + bk.infants;
              return (
                <li key={bk.bookingId} className={`py-3 first:pt-0 last:pb-0 ${isPast ? "opacity-80" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Тур + дата */}
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="text-[13px] font-semibold text-[var(--text)]">{bk.tourName}</span>
                        {bk.tourDate ? (
                          <span className={`text-[11px] tabular-nums ${isPast ? "text-[var(--muted2)]" : "text-[var(--accent)] font-medium"}`}>
                            {formatYmdWithWeekdayRu(bk.tourDate)}
                            {isPast ? " · прошёл" : " · скоро"}
                          </span>
                        ) : null}
                      </div>

                      {/* Пакс + статус + сумма */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                        <span>{bk.adults}В{bk.children > 0 ? `/${bk.children}Д` : ""}{bk.infants > 0 ? `/${bk.infants}М` : ""}{pax > 1 ? ` (${pax} чел.)` : ""}</span>
                        <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${payPill(bk.paymentStatus)}`}>
                          {payLabel(bk.paymentStatus)}
                        </span>
                        <span className="tabular-nums font-medium text-[var(--text)]">{formatVnd(bk.totalVnd)}</span>
                        {bk.dueVnd > 0 ? (
                          <span className="tabular-nums text-amber-700 dark:text-amber-300">−{formatVnd(bk.dueVnd)}</span>
                        ) : null}
                      </div>

                      {/* Менеджер (для директора если разные менеджеры) */}
                      {isDirectorLike && bk.managerName && bk.managerName !== tourist.managerName ? (
                        <p className="mt-0.5 text-[10px] text-[var(--muted2)]">Записал: {bk.managerName}</p>
                      ) : null}
                    </div>

                    {/* Действия */}
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {/* Перейти в бронь */}
                      <Link
                        href={`/tours/${bk.tourId}#booking-${bk.bookingId}`}
                        className="inline-flex h-8 items-center rounded-lg bg-[var(--surface-soft)] px-2.5 text-[11px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] no-underline hover:bg-[var(--surface-elevated)] whitespace-nowrap"
                      >
                        В бронь
                      </Link>
                      {/* Записать снова — только прошедшие туры + нужная роль */}
                      {isPast && canDuplicate ? (
                        <Link
                          href={`/bookings/${bk.bookingId}/duplicate`}
                          className="inline-flex h-8 items-center rounded-lg bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-white no-underline hover:brightness-105 whitespace-nowrap"
                        >
                          + Записать снова
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* TODO: автоматические повторные сообщения */}
      {/* TODO: бонус "приведи друга" — автоматически отправлять предложение через X дней после тура */}
    </main>
  );
}
