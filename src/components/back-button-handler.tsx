"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

/** Корневые экраны приложения — на них «назад» не должно закрывать приложение. */
const HOME_PATHS = ["/dashboard", "/accounting", "/dispatcher"];

const GUARD = "__amxExitGuard";

/**
 * И в установленном PWA (Android/iOS «Добавить на главный экран»), и в
 * обычной мобильной вкладке браузера системная кнопка/жест «назад» при
 * пустой истории закрывает приложение/вкладку — именно так это сейчас и
 * происходит. Подкладываем «страховочную» запись в историю: такое нажатие
 * гасится и повторно подкладывает страховку, вместо того чтобы закрыть
 * приложение/уйти со страницы.
 *
 * Заодно перехватываем аппаратную «назад» в нативном Capacitor-приложении —
 * если/когда оно появится, там действует тот же принцип через @capacitor/app
 * (сейчас на платформе PWA/web этот блок — no-op).
 */
export function BackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const armedRef = useRef(false);

  // ── Страховочная запись в истории браузера (PWA и обычная вкладка) ───────
  useEffect(() => {
    function pushGuard() {
      window.history.pushState({ [GUARD]: true }, "", window.location.href);
    }

    if (!armedRef.current) {
      armedRef.current = true;
      // Если в истории вкладки уже есть куда вернуться (страница открыта не
      // первой — обычная навигация, в т.ч. window.location.href при смене
      // tour_id), не дублируем текущий URL новой записью: иначе первое
      // нажатие «назад» уходит на дубль с тем же адресом, видимо ничего не
      // меняет и «съедает» нажатие. Страховку подкладываем только когда это
      // самая первая запись в истории вкладки (прямой заход по ссылке).
      if (window.history.length <= 1) pushGuard();
    }

    function onPopState(e: PopStateEvent) {
      const st = e.state as Record<string, unknown> | null;
      if (st && st[GUARD]) pushGuard();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Перевооружаем страховку на «домашних» экранах — на случай если она была
  // израсходована при возврате через несколько экранов подряд.
  useEffect(() => {
    if (!HOME_PATHS.includes(pathname)) return;
    const st = window.history.state as Record<string, unknown> | null;
    if (!st || !st[GUARD]) {
      window.history.pushState({ [GUARD]: true }, "", window.location.href);
    }
  }, [pathname]);

  // ── Capacitor: аппаратная «назад» в нативном приложении (если появится) ──
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");

        const sub = await App.addListener("backButton", ({ canGoBack }) => {
          const isHome = HOME_PATHS.includes(pathnameRef.current);
          if (!isHome && (canGoBack || window.history.length > 1)) {
            router.back();
          } else {
            void App.minimizeApp().catch(() => {});
          }
        });
        if (cancelled) sub.remove();
        else handle = sub;
      } catch {
        // не нативная платформа или плагин недоступен — ничего не делаем
      }
    })();

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [router]);

  return null;
}
