"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AppLogo } from "@/components/app-logo";
import { HeaderAvatar } from "@/components/header-avatar";
import { NavHeaderPerformance } from "@/components/nav-header-performance";
import { ReportIssueButton } from "@/components/report-issue-button";
import { LogoutButton } from "@/components/logout-button";
import { DirectorViewAsControl } from "@/components/director-view-as-control";
import { StaffNotificationsModalTrigger } from "@/components/staff-notifications-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  ACCOUNTING_PANEL_ROLES,
  CASH_VIEW_ROLES,
  ACCOUNTING_REPORTS_ACCESS_ROLES,
  defaultHomePathForRole,
  DISPATCHER_PAGE_ROLES,
  FINANCE_PAGE_ROLES,
  RENTALS_PAGE_ROLES,
  SALES_POINT_LEADERSHIP_ROLES,
  TEAM_PAGE_ROLES,
  TICKETS_PAGE_ROLES,
} from "@/lib/role-policy";
import { roleLabel } from "@/lib/role-labels";
import type { Role, SessionUser } from "@/lib/types";

type NavItem = { href: string; labelKey: string; roles: readonly Role[] | null };

function navItemIsActive(pathname: string, itemHref: string, allHrefs: readonly string[]): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  const item = itemHref.replace(/\/+$/, "") || "/";
  const matchesHref = (h: string) => {
    const x = h.replace(/\/+$/, "") || "/";
    return p === x || p.startsWith(`${x}/`);
  };
  if (!matchesHref(item)) return false;
  for (const h of allHrefs) {
    if (h === itemHref) continue;
    const x = h.replace(/\/+$/, "") || "/";
    if (x.length <= item.length) continue;
    if (!x.startsWith(`${item}/`)) continue;
    if (matchesHref(x)) return false;
  }
  return true;
}

const navAll: NavItem[] = [
  { href: "/dashboard", labelKey: "tours", roles: null },
  { href: "/tourists", labelKey: "tourists", roles: ["director", "chief_manager", "manager", "guide", "chief_guide", "accountant"] },
  { href: "/cash", labelKey: "cash", roles: CASH_VIEW_ROLES },
  { href: "/accounting", labelKey: "accounting", roles: ACCOUNTING_PANEL_ROLES },
  { href: "/finance", labelKey: "finance", roles: FINANCE_PAGE_ROLES },
  { href: "/rentals", labelKey: "rentals", roles: RENTALS_PAGE_ROLES },
  { href: "/sales-points", labelKey: "salesPoints", roles: SALES_POINT_LEADERSHIP_ROLES },
  { href: "/tickets", labelKey: "tickets", roles: TICKETS_PAGE_ROLES },
  { href: "/team", labelKey: "team", roles: TEAM_PAGE_ROLES },
];

function navForRole(role: Role): NavItem[] {
  if (role === "director") {
    const base = navAll.filter((item) => !item.roles || item.roles.includes(role));
    if (ACCOUNTING_REPORTS_ACCESS_ROLES.includes(role)) {
      return [...base, { href: "/accounting/reports", labelKey: "report", roles: null }];
    }
    return base;
  }
  if (role === "accountant") {
    return [
      { href: "/accounting", labelKey: "tours", roles: null },
      { href: "/cash", labelKey: "cash", roles: null },
      { href: "/tourists", labelKey: "tourists", roles: null },
      { href: "/accounting/reports", labelKey: "report", roles: null },
      { href: "/rentals", labelKey: "rentals", roles: null },
      { href: "/team", labelKey: "employees", roles: null },
    ];
  }
  if (DISPATCHER_PAGE_ROLES.includes(role)) {
    return [
      { href: "/dispatcher", labelKey: "workday", roles: null },
      { href: "/dashboard", labelKey: "tours", roles: null },
      { href: "/tickets", labelKey: "tickets", roles: null },
      { href: "/rentals", labelKey: "rentals", roles: null },
      { href: "/team", labelKey: "team", roles: null },
    ];
  }
  return navAll.filter((item) => !item.roles || item.roles.includes(role));
}

export function TopNav({ user }: { user?: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nav = user ? navForRole(user.role) : navAll;
  const navHrefs = nav.map((i) => i.href);
  const homeHref = user ? defaultHomePathForRole(user.role) : "/dashboard";

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const target = (ev instanceof TouchEvent ? ev.touches[0]?.target : ev.target) as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown as EventListener);
    document.addEventListener("touchstart", onDown as EventListener, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown as EventListener);
      document.removeEventListener("touchstart", onDown as EventListener);
    };
  }, [menuOpen]);

  return (
    <header className="mb-3 relative z-[100]">
      <div className="card flex min-w-0 w-full flex-col gap-2 !px-3.5 !py-3 sm:!px-4">

        {/* Строка: лого + меню */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 touch-manipulation">
            <AppLogo size={32} />
            <span className="truncate text-[13px] font-bold tracking-[-0.03em] text-[var(--text)]">EcoVoyage</span>
          </Link>
          <div className="relative shrink-0" ref={menuRef}>
            <div className="flex items-center gap-1">
              <ThemeToggle compact className="!min-h-[36px] !min-w-[36px]" />
              <button
                type="button"
                aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((s) => !s)}
                className="btn-secondary !min-h-[36px] !rounded-[10px] !px-2.5 !text-[13px]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]" fill="none" aria-hidden>
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                  {t("menu")}
                </span>
              </button>
            </div>

            {/* Dropdown меню */}
            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[min(78vh,480px)] w-[min(88vw,256px)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]">
                <div className="button-cluster">
                  {user ? <StaffNotificationsModalTrigger user={user} /> : null}
                  <ReportIssueButton />
                  {user ? (
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="btn-secondary min-h-[42px] w-full justify-start rounded-[10px] px-3 text-[13px] font-medium"
                    >
                      {t("profile")}
                    </Link>
                  ) : null}
                  {user ? (
                    <Link
                      href="/my-report"
                      onClick={() => setMenuOpen(false)}
                      className="btn-secondary min-h-[42px] w-full justify-start rounded-[10px] px-3 text-[13px] font-medium"
                    >
                      {t("myReport")}
                    </Link>
                  ) : null}
                  <LanguageSwitcher onSelect={() => setMenuOpen(false)} />
                  <LogoutButton />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Юзер-стрип */}
        {user ? (
          <div className="top-nav-user-strip">
            <HeaderAvatar user={user} />
            <div className="min-w-0 flex-1 overflow-hidden leading-snug">
              <div className="truncate text-[13px] font-semibold tracking-[-0.02em] text-[var(--text)]">{user.fullName}</div>
              <div className="mt-0.5 text-[11px] font-medium text-[var(--muted)]">{roleLabel(user.role)}</div>
              {user.managerMode ? (
                <div className="mt-0.5 text-[10px] text-[var(--muted2)]">{t("managerMode")}</div>
              ) : null}
              <NavHeaderPerformance role={user.role} />
            </div>
          </div>
        ) : null}

        {/* Переключатель роли (только директор / test) */}
        {(user?.baseRole === "director" || user?.login === "test") ? (
          <DirectorViewAsControl effectiveRole={user.role} />
        ) : null}

        {/* Навигация */}
        {user ? (
          <>
            {/* Mobile: навигация-переключатель */}
            <div className="md:hidden w-full relative">
              <select
                value={nav.find((item) => navItemIsActive(pathname, item.href, navHrefs))?.href ?? nav[0]?.href ?? ""}
                onChange={(e) => { router.push(e.target.value); }}
                className="w-full cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-4 pr-10 py-2.5 text-[14px] font-semibold text-[var(--text)] outline-none shadow-sm active:opacity-80"
                aria-label="Навигация"
              >
                {nav.map((item) => (
                  <option key={item.href} value={item.href}>
                    {t(item.labelKey as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[var(--muted)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Desktop md+: равноширинные вкладки */}
            <div className="hidden md:flex w-full min-w-0 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] divide-x divide-[var(--border)]">
              {nav.map((item) => {
                const active = navItemIsActive(pathname, item.href, navHrefs);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`flex flex-1 basis-0 min-w-0 touch-manipulation items-center justify-center py-2 text-[12.5px] font-semibold tracking-[-0.01em] transition-all duration-150 text-center leading-tight ${
                      active
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                    }`}
                  >
                    {t(item.labelKey as Parameters<typeof t>[0])}
                  </Link>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
