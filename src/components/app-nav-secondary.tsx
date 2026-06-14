import Link from "next/link";

/** Единый стиль для ссылок/кнопок «назад» и вторичной навигации (без стрелок). */
export const appNavSecondaryClassName =
  "inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] shadow-sm ring-1 ring-black/[0.04] transition hover:bg-[var(--surface-elevated)] dark:ring-white/[0.06]";

export function AppNavSecondaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={className ? `${appNavSecondaryClassName} ${className}` : appNavSecondaryClassName}>
      {children}
    </Link>
  );
}

export function AppNavSecondaryButton({
  onClick,
  children,
  className,
  type = "button",
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={className ? `${appNavSecondaryClassName} ${className}` : appNavSecondaryClassName}
    >
      {children}
    </button>
  );
}
