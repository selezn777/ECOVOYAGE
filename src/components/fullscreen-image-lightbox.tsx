"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN = 0.35;
const MAX = 6;
const STEP = 0.2;

export function FullscreenImageLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScale(1);
      return;
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onKey]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX, s + STEP)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(MIN, s - STEP)), []);
  const resetZoom = useCallback(() => setScale(1), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -STEP * 0.75 : STEP * 0.75;
    setScale((s) => Math.min(MAX, Math.max(MIN, s + delta)));
  }, []);

  if (!mounted || !open || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      role="dialog"
      aria-modal
      aria-label="Просмотр изображения"
    >
      <div className="flex shrink-0 items-center justify-end gap-2 px-3 py-2">
        <button
          type="button"
          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20"
          onClick={zoomOut}
        >
          −
        </button>
        <button
          type="button"
          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium tabular-nums text-white hover:bg-white/20"
          onClick={resetZoom}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20"
          onClick={zoomIn}
        >
          +
        </button>
        <button
          type="button"
          className="ml-2 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
      <div
        ref={wrapRef}
        className="min-h-0 flex-1 overflow-auto"
        onWheel={onWheel}
        onClick={onClose}
      >
        <div className="flex min-h-full min-w-full items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt || ""}
            className="max-h-[calc(100vh-80px)] max-w-full select-none object-contain"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
            }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      </div>
      <p className="shrink-0 px-3 pb-3 text-center text-[10px] text-white/40">
        Тап по затемнению или ✕ — закрыть
      </p>
    </div>,
    document.body,
  );
}
