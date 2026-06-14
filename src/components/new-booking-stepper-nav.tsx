"use client";

import Link from "next/link";

/** Навигация по шагам брони (сохраняет query: fromBooking, priorBooking). */
export function NewBookingStepperNav({
  tourId,
  activeStep,
  searchParams,
}: {
  tourId: string;
  activeStep: 1 | 2 | 3;
  /** Сериализованные query-параметры, например `fromBooking=…` без ведущего `?` */
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
  }
  const qs = sp.toString();
  const q = qs ? `?${qs}` : "";

  const item = (step: 1 | 2 | 3, href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-lg px-2 py-1 ring-1 transition-colors ${
        activeStep === step
          ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)] ring-[var(--accent)]/30"
          : "text-[var(--muted)] ring-transparent hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav
      className="flex flex-wrap items-center gap-1.5 text-[13px]"
      aria-label="Шаги добавления туриста"
    >
      {item(1, `/tours/${tourId}/new-booking${q}`, "1 · Состав")}
      <span className="text-[var(--muted2)]" aria-hidden>
        ·
      </span>
      {item(2, `/tours/${tourId}/new-booking/details${q}`, "2 · Контакты")}
      <span className="text-[var(--muted2)]" aria-hidden>
        ·
      </span>
      {item(3, `/tours/${tourId}/new-booking/payment${q}`, "3 · Оплата")}
    </nav>
  );
}
