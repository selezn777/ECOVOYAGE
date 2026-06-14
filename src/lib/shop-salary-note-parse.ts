/** Разбор note из API guide-extra-earnings для mode shop: `[shop-extra] получено=… офис=40%(…) …` */
export function parseShopExtraNote(note: string | null | undefined): {
  profitVnd: number | null;
  officeVnd: number | null;
  driverVnd: number | null;
  guideVnd: number | null;
  settlement: "guide_kept" | "office_received" | null;
} {
  if (!note?.trim()) return { profitVnd: null, officeVnd: null, driverVnd: null, guideVnd: null, settlement: null };
  const t = note.trim();
  const profit = t.match(/получено=(\d+)/);
  const office = t.match(/офис=\d+%\((\d+)\)/);
  const driver = t.match(/водитель=\d+%\((\d+)\)/);
  const guide = t.match(/гид=\d+%\((\d+)\)/);
  const settlement = t.match(/расчет=(guide_kept|office_received)/i);
  const legacyGuideKept = /деньги\s+у\s+гида/i.test(t);
  const legacyOfficeReceived = /деньги\s+в\s+офисе/i.test(t);
  const settlementValue =
    settlement
      ? (String(settlement[1]).toLowerCase() as "guide_kept" | "office_received")
      : legacyGuideKept
        ? "guide_kept"
        : legacyOfficeReceived
          ? "office_received"
          : null;
  return {
    profitVnd: profit ? Number(profit[1]) : null,
    officeVnd: office ? Number(office[1]) : null,
    driverVnd: driver ? Number(driver[1]) : null,
    guideVnd: guide ? Number(guide[1]) : null,
    settlement: settlementValue,
  };
}

/** Всё, кроме явного office_received - «деньги у гида» (включая legacy без расчет=). */
export function isShopMoneyWithGuideSettlement(
  settlement: "guide_kept" | "office_received" | null | undefined,
): boolean {
  return settlement !== "office_received";
}
