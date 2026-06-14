/** Compute profit line from template mode (per sale total or fixed × qty). */
export function computeProfitVnd(
  mode: "fixed" | "percent",
  value: number,
  saleTotalVnd: number,
  qty: number,
): number {
  if (mode === "fixed") return Math.round(Number(value) * qty);
  return Math.round((saleTotalVnd * Number(value)) / 100);
}
