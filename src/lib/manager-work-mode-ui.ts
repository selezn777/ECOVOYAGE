/**
 * Кнопки переключения режима (точка / промо / онлайн) — тот же вес и скругление,
 * что у WhatsApp / действий в карточке брони на странице тура.
 */
export function managerWorkModeToggleClass(active: boolean): string {
  const base =
    "inline-flex h-10 min-h-10 min-w-[5.75rem] flex-1 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium leading-none shadow-sm transition-[transform,filter] active:scale-[0.99]";
  return active
    ? `${base} border border-transparent bg-[var(--accent)] text-white ring-1 ring-[var(--accent)] hover:brightness-[1.06]`
    : `${base} border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] hover:brightness-[1.04]`;
}
