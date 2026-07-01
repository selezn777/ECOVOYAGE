"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavIcon } from "@/components/nav-icons";
import { navItemIsActive, type NavItem } from "@/lib/nav-items";

/** Нижняя навигация для мобильных — иконки + короткие подписи, активный пункт выделен. */
export function BottomNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const navHrefs = nav.map((item) => item.href);

  if (nav.length === 0) return null;

  return (
    <nav
      aria-label={t("menu")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <div className="mx-auto flex max-w-[640px] items-stretch">
        {nav.map((item) => {
          const active = navItemIsActive(pathname, item.href, navHrefs);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className="flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 py-1.5"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-[10px] transition-colors ${
                  active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
                }`}
              >
                <NavIcon name={item.labelKey} className="h-[19px] w-[19px]" />
              </span>
              <span className="flex h-5 w-full items-center justify-center px-0.5">
                <span
                  className={`line-clamp-2 text-center text-[8.5px] font-semibold leading-[1.15] tracking-[-0.01em] ${
                    active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
