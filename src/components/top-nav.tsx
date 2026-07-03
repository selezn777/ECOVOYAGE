"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AppLogo } from "@/components/app-logo";
import { BottomNav } from "@/components/bottom-nav";
import { HeaderAvatar } from "@/components/header-avatar";
import { NavHeaderPerformance } from "@/components/nav-header-performance";
import { ReportIssueButton } from "@/components/report-issue-button";
import { LogoutButton } from "@/components/logout-button";
import { DirectorViewAsControl } from "@/components/director-view-as-control";
import { StaffNotificationsModalTrigger } from "@/components/staff-notifications-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { defaultHomePathForRole } from "@/lib/role-policy";
import { navAll, navForRole, navItemIsActive } from "@/lib/nav-items";
import { roleLabel } from "@/lib/role-labels";
import type { SessionUser } from "@/lib/types";

export function TopNav({ user }: { user?: SessionUser }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nav = user ? navForRole(user.role) : navAll;
  const navHrefs = nav.map((i) => i.href);
  const homeHref = user ? defaultHomePathForRole(user.role) : "/dashboard";

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
    <header className="relative z-[100] mb-5">
      <div className="flex min-w-0 w-full flex-col gap-2 overflow-visible rounded-[24px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_58%,var(--accent-soft)_100%)] px-3.5 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.09)] ring-1 ring-white/45 sm:px-4 dark:shadow-[0_16px_36px_rgba(0,0,0,0.45)] dark:ring-white/[0.04]">

        {/* Строка: лого + меню */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Link href={homeHref} className="group flex min-w-0 items-center gap-2.5 touch-manipulation">
            <span className="grid h-12 w-12 shrink-0 place-items-center">
              <AppLogo size={42} />
            </span>
          </Link>
          <div className="relative shrink-0" ref={menuRef}>
            <div className="flex items-center gap-1">
              <ThemeToggle compact className="!min-h-[40px] !min-w-[40px] !rounded-[14px] !bg-[var(--surface)]/85" />
              <button
                type="button"
                aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((s) => !s)}
                className="btn-secondary !min-h-[40px] !rounded-[14px] !bg-[var(--surface)]/85 !px-3 !text-[13px] !font-extrabold"
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
              <div className="absolute right-0 top-[calc(100%+10px)] z-[220] max-h-[min(78vh,480px)] w-[min(88vw,272px)] overflow-y-auto overscroll-contain rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)] ring-1 ring-white/45 dark:ring-white/[0.04]">
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
                  {user && user.role !== "director" ? (
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
          <div className="flex w-full min-w-0 items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)]/82 px-3 py-2.5 text-left shadow-[var(--shadow-sm)] ring-1 ring-white/45 dark:ring-white/[0.04]">
            <HeaderAvatar user={user} />
            <div className="min-w-0 flex-1 overflow-hidden leading-snug">
              <div className="truncate text-[15px] font-extrabold text-[var(--text)]">{user.fullName}</div>
              <div className="mt-0.5 inline-flex max-w-full rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent-dark)]">
                <span className="truncate">{roleLabel(user.role)}</span>
              </div>
              {user.managerMode ? (
                <div className="mt-0.5 text-[10px] text-[var(--muted2)]">{t("managerMode")}</div>
              ) : null}
              <NavHeaderPerformance role={user.role} />
            </div>
          </div>
        ) : null}

        {/* Директору нужен быстрый просмотр интерфейса разных ролей. */}
        {user?.baseRole === "director" || user?.login === "test" ? (
          <DirectorViewAsControl effectiveRole={user.role} />
        ) : null}

        {/* Навигация: desktop md+ — равноширинные вкладки */}
        {user ? (
          <div className="hidden md:flex w-full min-w-0 gap-1.5 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]/82 p-1.5 shadow-[var(--shadow-sm)]">
            {nav.map((item) => {
              const active = navItemIsActive(pathname, item.href, navHrefs);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`flex flex-1 basis-0 min-w-0 touch-manipulation items-center justify-center rounded-[14px] px-3 py-2.5 text-center text-[13px] font-extrabold leading-tight transition-all duration-150 ${
                    active
                      ? "bg-[var(--accent)] text-white shadow-[0_10px_22px_rgba(134,202,0,0.25)]"
                      : "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]"
                  }`}
                >
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Mobile: нижний tab bar — вне .card, иначе animation:forwards на .card
          оставляет transform≠none и ломает containing block для position:fixed */}
      {user ? <BottomNav nav={nav} /> : null}
    </header>
  );
}
