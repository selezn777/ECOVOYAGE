import { getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import { CASH_VIEW_ROLES, canEditCashLedger } from "@/lib/role-policy";
import { CASH_MOVEMENTS_PAGE_SIZE } from "@/lib/cash-movements-constants";
import {
  getCashDashboardData,
  getCashBoxBalance,
  listAdvanceEmployeeOptions,
  listTeamRoster,
} from "@/lib/data";
import { CashBoxForm } from "@/components/cash-box-form";
import { CashBoxBalance } from "@/components/cash-box-balance";
import { CashMovementsTable } from "@/components/cash-movements-table";
import { formatYmdWithWeekdayRu, localDateString } from "@/lib/scheduling";
import { DollarRateWidget } from "@/components/dollar-rate-widget";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CashLedgerRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const CASH_BOX_KINDS: CashLedgerRow["kind"][] = [
  "office_cash_handover",
  "manual_in",
  "manual_out",
  "advance_issue",
  "advance_return",
  "payout",
];

export default async function CashPage() {
  const t = await getTranslations("cash");
  const tAccounting = await getTranslations("accounting");
  const tCommon = await getTranslations("common");
  const user = await requireRoles([...CASH_VIEW_ROLES]);
  if (isDemoUser(user))
    return (
      <main className="app-wrap">
        <div className="card mt-4 text-center text-[var(--muted)] py-12">{tCommon("demoNotAvailable")}</div>
      </main>
    );

  const canEdit = canEditCashLedger(user.role);
  const day = localDateString();

  const [cash, employeeOptionsRaw, rosterRows, balance] = await Promise.all([
    getCashDashboardData(day, { role: user.role, id: user.id }, null, {
      offset: 0,
      limit: CASH_MOVEMENTS_PAGE_SIZE,
    }),
    listAdvanceEmployeeOptions(),
    listTeamRoster(user.role),
    getCashBoxBalance(),
  ]);

  // Текущий курс доллара
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

  const employeeOptions =
    employeeOptionsRaw.length > 0
      ? employeeOptionsRaw
      : rosterRows
          .map((r) => ({ id: r.id, fullName: r.fullName }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  // Только реальные кассовые операции (без платежей туристов)
  const cashRows = cash.rows.filter((r) => CASH_BOX_KINDS.includes(r.kind));

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />

      {/* Курс доллара */}
      <section className="card mb-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{tAccounting("dollarRate")}</div>
        <DollarRateWidget
          initialRate={dollarRate}
          initialSetAt={dollarSetAt}
          initialSetByName={dollarSetByName}
          canEdit={user.role === "accountant"}
        />
      </section>

      {/* Баланс кассы */}
      <CashBoxBalance
        cashVnd={balance.cashVnd}
        bankVnd={balance.bankVnd}
        cashUsd={balance.cashUsd}
      />

      {/* Форма операции */}
      {canEdit && (
        <CashBoxForm
          employeeOptions={employeeOptions}
          currentRate={dollarRate}
        />
      )}

      {/* Журнал кассовых операций */}
      <section className="card mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("operationsJournal")}</h2>
          <span className="text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(day)}</span>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          {t("operationsJournalDescription")}
        </p>
        <CashMovementsTable
          initialRows={cashRows}
          totalRowCount={cashRows.length}
          pageSize={CASH_MOVEMENTS_PAGE_SIZE}
          showManualLedgerPartition={canEdit}
        />
      </section>
    </main>
  );
}
