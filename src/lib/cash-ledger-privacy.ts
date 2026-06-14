import { formatVnd } from "@/lib/format";
import { isShopMoneyWithGuideSettlement, parseShopExtraNote } from "@/lib/shop-salary-note-parse";
import { ACCOUNTANT_TOUR_SALARY_KIND } from "@/lib/sync-accountant-tour-salary-record";
import type { Role } from "@/lib/types";

/** Кто видит полный текст выплаты гиду (в т.ч. «вне магазина», доли, название точки). */
export function canViewConfidentialGuidePayoutDetail(viewer: { role: Role; id: string } | null, guideId: string): boolean {
  if (!viewer) return false;
  if (viewer.role === "director") return true;
  if ((viewer.role === "guide" || viewer.role === "chief_guide") && viewer.id === guideId) return true;
  return false;
}

/** Выплата из режима «вне официального магазина» - детали только у гида (и директора). */
export function guideSalaryPayoutIsOutsideShopConfidential(
  kind: string | null | undefined,
  note: string | null | undefined,
  outsideTotalVnd: number | null | undefined,
): boolean {
  const k = String(kind || "").trim();
  if (k === "levals") return true;
  const ot = outsideTotalVnd != null ? Number(outsideTotalVnd) : 0;
  if (Number.isFinite(ot) && ot > 0) return true;
  const n = note?.trim() || "";
  if (/\[levals-extra\]/i.test(n)) return true;
  if (/\blevals\b/i.test(n) && /extra/i.test(n)) return true;
  return false;
}

export function guideSalaryPayoutIsOfficialShop(kind: string | null | undefined, note: string | null | undefined): boolean {
  if (String(kind || "").trim() === "shop") return true;
  const n = note?.trim() || "";
  return /\[shop-extra\]/i.test(n);
}

function defaultSalaryPhrase(kind: string | null | undefined, note: string | null | undefined): string {
  const k = String(kind || "").trim();
  if (k === "accountant_tour" || k === ACCOUNTANT_TOUR_SALARY_KIND) {
    return "зарплата по туру (зафиксировано бухгалтерией)";
  }
  const n = note?.trim();
  if (n) return n.length > 200 ? `${n.slice(0, 197)}…` : n;
  return "выплата по начислению гиду";
}

export function buildOfficialShopPayoutSummary(
  guideName: string,
  tourLine: string,
  note: string | null | undefined,
  amountVnd: number,
): string {
  const p = parseShopExtraNote(note);
  const withGuide = isShopMoneyWithGuideSettlement(p.settlement);
  const moneyPhrase = withGuide ? "деньги у гида" : "деньги в офисе";
  const parts = [
    `${withGuide ? "Поступление в кассу" : "Выплата из кассы"} · официальный магазин · гид ${guideName} · ${tourLine}`,
    moneyPhrase,
    `${withGuide ? "в кассу учтено" : "выплачено гиду"} ${formatVnd(amountVnd)}`,
  ];
  if (p.officeVnd != null && p.officeVnd > 0) {
    parts.push(`доля офиса в выручке ${formatVnd(p.officeVnd)}`);
  }
  if (p.driverVnd != null && p.driverVnd > 0) {
    parts.push(`водителю ${formatVnd(p.driverVnd)}`);
  }
  if (p.guideVnd != null && p.guideVnd > 0 && p.guideVnd !== amountVnd) {
    parts.push(`по схеме разбивки гиду ${formatVnd(p.guideVnd)}`);
  }
  return parts.join(" · ");
}

export function buildGuideSalaryCashLedgerSummary(args: {
  kind: string | null | undefined;
  note: string | null | undefined;
  outsideTotalVnd: number | null | undefined;
  guideName: string;
  guideId: string;
  tourLine: string;
  amountVnd: number;
  viewer: { role: Role; id: string } | null;
  cashFlow?: "in" | "out";
}): { summary: string; searchText: string; ledgerNote: string | null } {
  const { kind, note, outsideTotalVnd, guideName, guideId, tourLine, amountVnd, viewer, cashFlow } = args;
  const noteTrim = note?.trim() || null;

  if (guideSalaryPayoutIsOfficialShop(kind, note)) {
    const summary = buildOfficialShopPayoutSummary(guideName, tourLine, note, amountVnd);
    return {
      summary,
      searchText: `${summary} ${guideName} ${tourLine} ${amountVnd}`.toLowerCase(),
      ledgerNote: noteTrim,
    };
  }

  if (guideSalaryPayoutIsOutsideShopConfidential(kind, note, outsideTotalVnd)) {
    const canSee = canViewConfidentialGuidePayoutDetail(viewer, guideId);
    if (canSee) {
      const detail = defaultSalaryPhrase(kind, note);
      const summary = `${cashFlow === "in" ? "Поступление в кассу" : "Выплата из кассы"} · ${detail} · гид ${guideName} · ${tourLine}`;
      return {
        summary,
        searchText: `${summary} ${note || ""}`.toLowerCase(),
        ledgerNote: noteTrim,
      };
    }
    const summary = `${cashFlow === "in" ? "Поступление в кассу" : "Выплата из кассы"} · вне официального магазина (подробности только у гида) · гид ${guideName} · ${tourLine} · сумма ${formatVnd(amountVnd)}`;
    return {
      summary,
      searchText: `${guideName} ${tourLine} ${amountVnd} вне магазина выплата гид`.toLowerCase(),
      ledgerNote: null,
    };
  }

  const phrase = defaultSalaryPhrase(kind, note);
  const summary = `${cashFlow === "in" ? "Поступление в кассу" : "Выплата из кассы"} · ${phrase} · гид ${guideName} · ${tourLine}`;
  return {
    summary,
    searchText: `${summary} ${note || ""} ${amountVnd}`.toLowerCase(),
    ledgerNote: noteTrim,
  };
}
