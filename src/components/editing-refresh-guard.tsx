"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function mayRestoreFocus(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return false;
    const t = (el.type || "").toLowerCase();
    // Для файлов/чекбоксов/радио и т.п. восстановление фокуса не нужно.
    if (["checkbox", "radio", "file", "button", "submit", "reset"].includes(t)) return false;
    return true;
  }
  if (el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return false;
    return true;
  }
  return false;
}

/**
 * Prevent accidental page reload/navigation while user is typing.
 * Some flows still trigger reload/replace from async actions; we defer those
 * until focus leaves editable fields so mobile keyboard does not collapse.
 */
export function EditingRefreshGuard() {
  useEffect(() => {
    let isEditing = false;
    let pendingAction: (() => void) | null = null;
    let blurTimer: number | null = null;
    let focusRestoreTimer: number | null = null;
    let patchedReload = false;
    let patchedAssign = false;
    let patchedReplace = false;
    let lastEditable: HTMLInputElement | HTMLTextAreaElement | null = null;
    let lastPointerDownAt = 0;
    let lastViewportResizeAt = 0;
    let lastAutoRestoreAt = 0;

    const nativeReload = window.location.reload.bind(window.location);
    const nativeAssign = window.location.assign.bind(window.location);
    const nativeReplace = window.location.replace.bind(window.location);

    const runOrQueue = (action: () => void) => {
      if (isEditing) {
        pendingAction = action;
        return;
      }
      action();
    };

    // Some browsers lock Location methods; never crash app if patching is denied.
    try {
      window.location.reload = function reloadPatched() {
        runOrQueue(() => nativeReload());
      };
      patchedReload = true;
    } catch {}
    try {
      window.location.assign = function assignPatched(url: string | URL) {
        runOrQueue(() => nativeAssign(url));
      };
      patchedAssign = true;
    } catch {}
    try {
      window.location.replace = function replacePatched(url: string | URL) {
        runOrQueue(() => nativeReplace(url));
      };
      patchedReplace = true;
    } catch {}

    const onChunkCrash = (message: string) => {
      const text = String(message || "");
      if (
        !/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|dynamically imported/i.test(text)
      ) {
        return;
      }
      try {
        const key = "__amx_chunk_reload_once__";
        if (window.sessionStorage.getItem(key) === "1") return;
        window.sessionStorage.setItem(key, "1");
      } catch {}
      nativeReload();
    };
    const onWindowError = (e: ErrorEvent) => {
      onChunkCrash(e.message);
    };
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const text =
        typeof reason === "string"
          ? reason
          : reason && typeof reason === "object" && "message" in reason
            ? String((reason as { message?: unknown }).message ?? "")
            : String(reason ?? "");
      onChunkCrash(text);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditableTarget(e.target)) return;
      isEditing = true;
      if (mayRestoreFocus(e.target as Element)) lastEditable = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (blurTimer != null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (focusRestoreTimer != null) {
        window.clearTimeout(focusRestoreTimer);
        focusRestoreTimer = null;
      }
    };

    const onFocusOut = () => {
      if (blurTimer != null) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        const active = document.activeElement;
        isEditing = isEditableTarget(active);
        if (!isEditing && pendingAction) {
          const fn = pendingAction;
          pendingAction = null;
          fn();
        }
      }, 180);

      // Мягко восстанавливаем фокус после системных жестов/ресайза viewport,
      // чтобы клавиатура не схлопывалась во время ввода.
      if (focusRestoreTimer != null) window.clearTimeout(focusRestoreTimer);
      focusRestoreTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (isEditableTarget(active)) return;
        if (!lastEditable || !document.contains(lastEditable)) return;
        if (!mayRestoreFocus(lastEditable)) return;

        const now = Date.now();
        const pointerAgo = now - lastPointerDownAt;
        const viewportAgo = now - lastViewportResizeAt;
        const restoreAgo = now - lastAutoRestoreAt;

        // Если пользователь явно тапнул по интерфейсу, не вмешиваемся.
        if (pointerAgo < 240) return;
        // Реагируем только на свежий resize viewport (типично при системной навигации/клавиатуре).
        if (viewportAgo > 360) return;
        // Анти-циклы.
        if (restoreAgo < 800) return;

        try {
          lastEditable.focus({ preventScroll: true });
          // Для iOS иногда нужен явный setSelectionRange для реального возврата клавиатуры.
          if (lastEditable instanceof HTMLInputElement || lastEditable instanceof HTMLTextAreaElement) {
            const len = lastEditable.value?.length ?? 0;
            lastEditable.setSelectionRange(len, len);
          }
          lastAutoRestoreAt = Date.now();
        } catch {
          // ignore
        }
      }, 120);
    };

    const onPointerDown = () => {
      lastPointerDownAt = Date.now();
    };

    const onViewportResize = () => {
      lastViewportResizeAt = Date.now();
    };

    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      if (blurTimer != null) window.clearTimeout(blurTimer);
      if (focusRestoreTimer != null) window.clearTimeout(focusRestoreTimer);
      if (patchedReload) window.location.reload = nativeReload;
      if (patchedAssign) window.location.assign = nativeAssign;
      if (patchedReplace) window.location.replace = nativeReplace;
    };
  }, []);

  return null;
}

