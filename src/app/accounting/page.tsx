import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { AccountingTourFilters } from "@/components/accounting-tour-filters";
import { AccountingToursTable } from "@/components/accounting-tours-table";
import { AccountingPendingHandovers } from "@/components/accounting-pending-handovers";
import { listAccountingTours } from "@/lib/data";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import type { FinancePeriod } from "@/lib/types";
import { tourBusinessTodayYmd } from "@/lib/scheduling";
import { DollarRateWidget } from "@/components/dollar-rate-widget";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type TourTimeTab = "today" | "past" | "upcoming";

function pickSp(v?: string | string[]): string {
  if (v == null) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

function parseTourTimeTab(raw: string): TourTimeTab {
  if (raw === "past" || raw === "upcoming") return raw;
  return "today";
}

function accountingQueryLink(tab: TourTimeTab, q: string, tourExact: string, openIssuesOnly: boolean): string {
  const p = new URLSearchParams();
  p.set("tours", tab);
  if (tourExact.trim()) p.set("tour", tourExact.trim());
  else if (q.trim()) p.set("q", q.trim());
  if (openIssuesOnly) p.set("open", "1");
  return `/accounting?${p.toString()}`;
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tours?: string | string[];
    q?: string | string[];
    tour?: string | string[];
    open?: string | string[];
  }>;
}) {
  const t = await getTranslations("accounting");
  const tC = await getTranslations("common");
  const user = await requireRoles([...ACCOUNTING_PANEL_ROLES]);
  if (isDemoUser(user)) return <main className="app-wrap"><div className="card mt-4 text-center text-[var(--muted)] py-12">{tC("noData")}</div></main>;

  const supabase = getSupabaseAdmin();
  let dollarRate = 26000;
  let dollarSetAt: string | null = null;
  let dollarSetByName: string | null = null;
  if (supabase) {
    const { data: rateRows } = await supabase
      .from("currency_rates")
      .select("rate, set_at, set_by")
      .eq("active", true)
      .eq("base_currency", "USD")
      .eq("quote_currency", "VND")
      .order("set_at", { ascending: false })
      .limit(1);
    const rr = rateRows?.[0] as { rate?: unknown; set_at?: string | null; set_by?: string | null } | undefined;
    if (rr && Number(rr.rate) > 0) {
      dollarRate = Math.round(Number(rr.rate));
      dollarSetAt = rr.set_at ?? null;
      if (rr.set_by) {
        const { data: uData } = await supabase.from("users").select("full_name").eq("id", rr.set_by).maybeSingle();
        dollarSetByName = (uData as { full_name?: string } | null)?.full_name?.trim() || null;
      }
    }
  }

  const sp = await searchParams;
  const tourTab = parseTourTimeTab(pickSp(sp.tours).trim());
  const q = pickSp(sp.q).trim();
  const tourExact = pickSp(sp.tour).trim();
  const openIssuesOnly = pickSp(sp.open).trim() === "1";

  const period: FinancePeriod = { kind: "all" };
  const accountingTours = await listAccountingTours(period, 500);

  const todayYmd = tourBusinessTodayYmd();
  const toursToday: typeof accountingTours = [];
  const toursPast: typeof accountingTours = [];
  const toursUpcoming: typeof accountingTours = [];
  for (const tour of accountingTours) {
    const d = tour.tourDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if ((tour.pax ?? 0) === 0) continue;
    if (d === todayYmd) toursToday.push(tour);
    else if (d < todayYmd) toursPast.push(tour);
    else toursUpcoming.push(tour);
  }
  toursPast.sort((a, b) => b.tourDate.localeCompare(a.tourDate));
  toursUpcoming.sort((a, b) => a.tourDate.localeCompare(b.tourDate));
  toursToday.sort((a, b) => a.tourName.localeCompare(b.tourName, "ru"));

  let tabRows =
    tourTab === "today" ? toursToday : tourTab === "past" ? toursPast : toursUpcoming;

  if (tourExact) {
    tabRows = tabRows.filter((tour) => tour.tourName.toLowerCase() === tourExact.toLowerCase());
  } else if (q) {
    const needle = q.toLowerCase();
    tabRows = tabRows.filter((tour) => tour.tourName.toLowerCase().includes(needle));
  }

  if (tourTab === "past" && openIssuesOnly) {
    tabRows = tabRows.filter((tour) => tour.accountingStatus === "open");
  }

  const upcomingTab = tourTab === "upcoming";
  const tourNames = [...new Set(accountingTours.map((tour) => tour.tourName).filter(Boolean))];

  const tabChip =
    "flex min-h-[48px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center transition-colors";
  const tabChipOn = "bg-[var(--accent)] text-white shadow-sm";
  const tabChipOff =
    "bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]";

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />

      <section className="card mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{t("dollarRate")}</span>
        </div>
        <DollarRateWidget
          initialRate={dollarRate}
          initialSetAt={dollarSetAt}
          initialSetByName={dollarSetByName}
          canEdit={user.role === "accountant"}
        />
      </section>

      {!q && !tourExact ? (
        <AccountingPendingHandovers
          tourRows={
            tourTab === "today"
              ? toursToday
              : tourTab === "past"
                ? toursPast.filter((t) => t.accountingStatus === "open").slice(0, 60)
                : toursUpcoming.slice(0, 40)
          }
          todayYmd={todayYmd}
          tab={tourTab}
        />
      ) : null}

      <section className="card mb-3 min-w-0">
        <AccountingTourFilters
          tourNames={tourNames}
          q={q}
          tourExact={tourExact}
          preserved={{ tours: tourTab, openOnly: openIssuesOnly ? "1" : "" }}
          searchPlaceholder={t("searchPlaceholder")}
          searchLabel={t("searchLabel")}
        />
        <h2 className="mb-3 text-base font-semibold">{t("tours")}</h2>
        <nav className="mb-3 grid w-full grid-cols-3 gap-1.5" aria-label={t("tours")}>
          <Link
            href={accountingQueryLink("today", q, tourExact, false)}
            className={`${tabChip} ${tourTab === "today" ? tabChipOn : tabChipOff}`}
          >
            <span className="text-[12px] font-semibold leading-none">{t("today")}</span>
            <span className="text-[11px] tabular-nums opacity-80">({toursToday.length})</span>
          </Link>
          <Link
            href={accountingQueryLink("past", q, tourExact, openIssuesOnly)}
            className={`${tabChip} ${tourTab === "past" ? tabChipOn : tabChipOff}`}
          >
            <span className="text-[12px] font-semibold leading-none">{t("past")}</span>
            <span className="text-[11px] tabular-nums opacity-80">({toursPast.length})</span>
          </Link>
          <Link
            href={accountingQueryLink("upcoming", q, tourExact, false)}
            className={`${tabChip} ${tourTab === "upcoming" ? tabChipOn : tabChipOff}`}
          >
            <span className="text-[12px] font-semibold leading-none">{t("upcoming")}</span>
            <span className="text-[11px] tabular-nums opacity-80">({toursUpcoming.length})</span>
          </Link>
        </nav>
        {tourTab === "past" ? (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Link
              href={accountingQueryLink("past", q, tourExact, false)}
              className={`rounded-lg px-2.5 py-1.5 font-medium ring-1 ring-[var(--border)] ${
                !openIssuesOnly ? "bg-[var(--accent)] text-white ring-transparent" : "text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              {t("allPast")}
            </Link>
            <Link
              href={accountingQueryLink("past", q, tourExact, true)}
              className={`rounded-lg px-2.5 py-1.5 font-medium ring-1 ring-[var(--border)] ${
                openIssuesOnly ? "bg-amber-600 text-white ring-transparent" : "text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              {t("openIssues")}
              <span className="ml-1 tabular-nums opacity-90">
                ({toursPast.filter((tour) => tour.accountingStatus === "open").length})
              </span>
            </Link>
          </div>
        ) : null}
        {accountingTours.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("noTours")}</p>
        ) : tabRows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {tourTab === "today" ? t("noToday") : tourTab === "past" ? t("noPast") : t("noUpcoming")}
            {q || tourExact ? ` ${t("tryResetSearch")}` : ""}
          </p>
        ) : (
          <AccountingToursTable rows={tabRows} upcomingTab={upcomingTab} todayYmd={todayYmd} />
        )}
      </section>
    </main>
  );
}
