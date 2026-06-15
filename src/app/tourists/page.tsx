import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { requireAuth } from "@/lib/auth-session";
import { searchBookingsGlobal } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { formatYmdWeekdayLongDmy, formatYmdWithWeekday, tourBusinessTodayYmd } from "@/lib/scheduling";
import { maskPhone } from "@/lib/tourist-sale-phone";

export const dynamic = "force-dynamic";

function pickSp(v?: string | string[]): string {
  if (v == null) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

const TOURIST_LIST_ROLES = ["director", "chief_manager", "accountant", "manager", "guide", "chief_guide"] as const;

function payStatusPill(s: string) {
  if (s === "paid")
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800/50";
  if (s === "partial")
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800/50";
  return "bg-red-50 text-red-800 ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900/50";
}

function payStatusLabel(s: string, t: Awaited<ReturnType<typeof getTranslations<"touristsPage">>>) {
  if (s === "paid") return t("statusPaid");
  if (s === "partial") return t("statusPartial");
  return t("statusDue");
}

function paxLine(a: number, c: number, i: number, tBooking: Awaited<ReturnType<typeof getTranslations<"booking">>>) {
  const parts: string[] = [];
  if (a) parts.push(`${a} ${tBooking("adultsShort")}`);
  if (c) parts.push(`${c} ${tBooking("childrenShort")}`);
  if (i) parts.push(`${i} ${tBooking("infantsShort")}`);
  return parts.join(", ") || "0";
}

export default async function TouristsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireAuth();
  const t = await getTranslations("touristsPage");
  const tBooking = await getTranslations("booking");
  const locale = await getLocale();
  if (!(TOURIST_LIST_ROLES as readonly string[]).includes(user.role)) {
    return (
      <main className="app-wrap">
        <TopNav user={user} />
        <div className="card mt-4 py-12 text-center text-[var(--muted)]">{t("accessDenied")}</div>
      </main>
    );
  }

  const sp = await searchParams;
  const q = pickSp(sp.q).trim();

  const isChiefGuide = user.role === "chief_guide" || user.baseRole === "chief_guide";
  const isChiefManager = user.role === "chief_manager";
  const baseRoleIsGuide = user.baseRole === "guide";
  const isGuide = user.role === "guide" || baseRoleIsGuide;
  const isDirector = user.role === "director";
  // Директор / ст.гид / гл.менеджер — видят всё включая все номера
  const isDirectorLike = isDirector || isChiefGuide || isChiefManager;
  const isManager = !isGuide && !isChiefGuide && !isChiefManager && user.role === "manager";

  // Видимость номера:
  // isDirectorLike → всегда виден
  // isManager → виден только если managerId === user.id
  // isGuide → виден (guideId-фильтр даёт только туристов назначенных туров)
  // остальные → всегда маска
  function isPhoneVisible(managerId: string): boolean {
    if (isDirectorLike) return true;
    if (isManager) return managerId === user.id;
    if (isGuide) return true;
    return false;
  }

  // Гид: фильтр по своим турам (видит только назначенных)
  const guideId = isGuide ? user.id : null;
  // Менеджер: только свои брони (manager_id = user.id)
  const managerIdFilter = isManager ? user.id : null;
  const isAccountant = user.role === "accountant";
  const shouldFetch = isDirectorLike || isManager || isGuide || isAccountant || q.length > 0;
  const limit = isDirectorLike ? 1000 : isManager ? 500 : isAccountant ? 500 : 150;

  const rows = shouldFetch
    ? await searchBookingsGlobal(q, managerIdFilter, limit, guideId, {
        allowEmpty: isDirectorLike || isManager || isAccountant,
        orderByOnCode: (isDirectorLike || isAccountant) && !q,
      })
    : [];

  const totalPax = rows.reduce((s, r) => s + r.adults + r.children + r.infants, 0);
  const totalDueSum = rows.reduce((s, r) => s + r.dueVnd, 0);

  const todayYmd = tourBusinessTodayYmd();
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.tourDate ?? "no-date";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  const dateGroups = [...grouped.entries()].sort(([a], [b]) => {
    const aFuture = a === "no-date" || a >= todayYmd;
    const bFuture = b === "no-date" || b >= todayYmd;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? a.localeCompare(b) : b.localeCompare(a);
  });

  // Группы по датам — без сворачивания
  function DateAccordion() {
    return (
      <>
        {dateGroups.map(([dateKey, groupRows]) => {
          const isPastGroup = dateKey !== "no-date" && dateKey < todayYmd;
          const groupLabel = dateKey === "no-date" ? t("noDate") : formatYmdWeekdayLongDmy(dateKey, locale);
          return (
            <div key={dateKey} className="mb-3">
              <div className={`mb-2 flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-bold leading-snug tracking-wide ${
                isPastGroup
                  ? "bg-[var(--surface-elevated)] text-[var(--muted2)] ring-1 ring-[var(--border)]"
                  : "bg-[var(--accent)] text-white shadow-[0_2px_6px_rgba(255,90,55,0.25)]"
              }`}>
                <span>{groupLabel}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${isPastGroup ? "bg-[var(--border)]" : "bg-white/25"}`}>
                  {groupRows.length}
                </span>
              </div>

              <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {groupRows.map((r) => {
                  const pax = r.adults + r.children + r.infants;
                  const isPast = isPastGroup;
                  const rowBg = isPast
                    ? r.dueVnd > 0 ? "bg-red-50/25 dark:bg-red-950/10" : "bg-emerald-50/20 dark:bg-emerald-950/10"
                    : "";
                  const phoneVisible = isPhoneVisible(r.managerId);
                  const displayPhone = phoneVisible ? r.phone : maskPhone(r.phone);
                  const canContact = phoneVisible && !!r.phone;
                  const waHref = canContact ? `https://wa.me/${r.phone.replace(/[^\d]/g, "")}` : null;
                  const tgHref = canContact && r.telegramUsername
                    ? `tg://msg?to=${encodeURIComponent(r.telegramUsername.startsWith("@") ? r.telegramUsername : `@${r.telegramUsername}`)}`
                    : null;

                  return (
                    <div
                      key={r.bookingId}
                      className={`flex items-start gap-2 px-4 py-2.5 ${rowBg} ${isPast ? "opacity-75" : ""}`}
                    >
                      <Link
                        href={`/tourists/${r.bookingId}`}
                        className="min-w-0 flex-1 transition-opacity hover:opacity-80"
                      >
                        {/* Строка 1: ON + имя + статус */}
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ring-1 ${
                            r.onlineCode
                              ? "bg-[var(--accent)]/10 text-[var(--accent)] ring-[var(--accent)]/20"
                              : "bg-[var(--surface-soft)] text-[var(--muted2)] ring-[var(--border)]"
                          }`}>
                            {r.onlineCode ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                            {r.customerName}
                          </span>
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${payStatusPill(r.paymentStatus)}`}>
                            {payStatusLabel(r.paymentStatus, t)}
                          </span>
                        </div>

                        {/* Строка 2: телефон · отель · пакс */}
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-[var(--muted)]">
                          <span className="tabular-nums">{displayPhone}</span>
                          {r.hotel ? <span>· {r.hotel}</span> : null}
                          <span>· {paxLine(r.adults, r.children, r.infants, tBooking)}{pax > 1 ? ` (${pax})` : ""}</span>
                        </div>

                        {/* Строка 3: тур + менеджер (для директора) + сумма */}
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0 text-[11px]">
                          <div className="flex min-w-0 flex-wrap gap-x-2">
                            <span className="font-medium text-[var(--muted2)]">
                              {r.tourName}
                              {q && r.tourDate ? <span className="ml-1 font-normal">· {formatYmdWithWeekday(r.tourDate, locale)}</span> : null}
                            </span>
                            {(isDirectorLike || isManager) && r.managerName ? (
                              <span className="text-[var(--muted2)]">· {r.managerName}</span>
                            ) : null}
                          </div>
                          <div className="shrink-0 tabular-nums">
                            <span className="font-semibold text-[var(--text)]">{formatVnd(r.totalVnd)}</span>
                            {r.dueVnd > 0 ? (
                              <span className="ml-1 text-amber-700 dark:text-amber-300">−{formatVnd(r.dueVnd)}</span>
                            ) : null}
                          </div>
                        </div>
                      </Link>

                      {/* WA / TG — только если номер виден */}
                      {(waHref || tgHref) ? (
                        <div className="flex shrink-0 flex-col gap-1 pt-0.5">
                          {waHref ? (
                            <a href={waHref} target="_blank" rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366] text-white"
                              aria-label="WhatsApp">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                          ) : null}
                          {tgHref ? (
                            <a href={tgHref}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2AABEE] text-white"
                              aria-label="Telegram">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.617l-2.95-.924c-.64-.203-.658-.64.136-.954l11.57-4.461c.537-.194 1.006.131.878.943z"/></svg>
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />

      <section className="card mb-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold text-[var(--text)]">{t("title")}</h1>
          {(isDirectorLike || isManager || isAccountant) && rows.length > 0 ? (
            <span className="text-xs text-[var(--muted)]">
              {t("bookingsAndPax", { count: rows.length, pax: totalPax })}
            </span>
          ) : null}
        </div>
        {isGuide ? (
          <p className="mb-3 text-sm text-[var(--muted)]">{t("hintGuide")}</p>
        ) : isDirectorLike ? (
          <p className="mb-3 text-sm text-[var(--muted)]">{t("hintDirector")}</p>
        ) : isManager ? (
          <p className="mb-3 text-sm text-[var(--muted)]">{t("hintManager")}</p>
        ) : isAccountant ? (
          <p className="mb-3 text-sm text-[var(--muted)]">{t("hintAccountant")}</p>
        ) : (
          <p className="mb-3 text-sm text-[var(--muted)]">{t("hintDefault")}</p>
        )}
        <form method="get" className="flex min-w-0 items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="field-surface min-h-[44px] min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn-primary min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-semibold touch-manipulation"
          >
            {t("searchButton")}
          </button>
        </form>
      </section>

      {!shouldFetch && !q ? (
        <div className="card py-10 text-center text-sm text-[var(--muted)]">
          {t("enterNameOrHotel")}
        </div>
      ) : rows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-[var(--muted)]">
          {q ? t("noResultsForQuery", { q }) : t("noTouristsYet")}
        </div>
      ) : (isDirectorLike || isManager || isGuide) ? (
        /* ── Аккордион по датам ── */
        <section className="card">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              {q ? t("searchResults") : t("byDates")}
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {t("bookingsAndPax", { count: rows.length, pax: totalPax })}
              {totalDueSum > 0 ? (
                <span className="ml-1 text-amber-700 dark:text-amber-300">
                  · {t("toCollect")} {formatVnd(totalDueSum)}
                </span>
              ) : null}
            </span>
          </div>
          <DateAccordion />
          {rows.length >= limit ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {t("shownOf", { limit })}
            </p>
          ) : null}
        </section>
      ) : (
        /* ── Бухгалтер / прочие: поиск-список без номеров ── */
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">{t("results")}</h2>
            <span className="text-xs text-[var(--muted)]">{t("itemsCount", { count: rows.length })}</span>
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.bookingId}>
                <Link
                  href={`/tourists/${r.bookingId}`}
                  className="block rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 no-underline hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{r.customerName}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {r.hotel || "—"}
                        {r.onlineCode ? (
                          <span className="ml-1.5 font-mono text-[10px] font-medium text-[var(--muted2)]">{r.onlineCode}</span>
                        ) : null}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${payStatusPill(r.paymentStatus)}`}>
                      {payStatusLabel(r.paymentStatus, t)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                    <span>{paxLine(r.adults, r.children, r.infants, tBooking)}</span>
                    <span className="tabular-nums font-medium text-[var(--text)]">{formatVnd(r.totalVnd)}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-[var(--muted2)]">
                    {r.tourName || t("noTourFallback")}
                    {r.tourDate ? <span className="ml-1">· {formatYmdWithWeekday(r.tourDate, locale)}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length >= limit ? (
            <p className="mt-3 text-xs text-[var(--muted)]">{t("shownOfSimple", { limit })}</p>
          ) : null}
        </section>
      )}
    </main>
  );
}
