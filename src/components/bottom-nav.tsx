"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NavIcon } from "@/components/nav-icons";
import { navItemIsActive, type NavItem } from "@/lib/nav-items";

const KEYBOARD_INPUT_TYPES = new Set([
  "button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image",
]);

function opensKeyboard(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !KEYBOARD_INPUT_TYPES.has(type);
  }
  return el.isContentEditable;
}

/** Нижняя навигация для мобильных — иконки + короткие подписи, активный пункт выделен. */
export function BottomNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const navHrefs = nav.map((item) => item.href);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const onFocusIn = (e: FocusEvent) => {
      if (!opensKeyboard(e.target)) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      setKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!opensKeyboard(e.target)) return;
      // Небольшая задержка: при переходе фокуса между полями (Tab/Next) не мигаем баром
      hideTimer = setTimeout(() => setKeyboardOpen(false), 80);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (nav.length === 0) return null;

  return (
    <nav
      aria-label={t("menu")}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm transition-transform duration-150 md:hidden ${
        keyboardOpen ? "translate-y-full" : ""
      }`}
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
