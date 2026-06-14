/** Ориентиры МРОТ по зонам Вьетнама (частный сектор, 2026; уточняйте по актуальному НД). */
export const VIETNAM_MROT_VND_BY_ZONE: Record<"I" | "II" | "III" | "IV", number> = {
  I: 4_960_000,
  II: 4_730_000,
  III: 4_140_000,
  IV: 3_710_000,
};

/** С 01.07.2025: всего 32% от базы взносов - сотрудник 10,5%, работодатель 21,5% (BHXH+BHYT+BHTN). */
export const VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT = 10.5;
export const VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT = 21.5;
export const VIETNAM_SOCIAL_TOTAL_PCT = VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT + VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT;

export function formatVndPlain(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₫`;
}
