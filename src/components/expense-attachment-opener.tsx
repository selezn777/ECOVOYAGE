"use client";

import { useState } from "react";
import { FullscreenImageLightbox } from "@/components/fullscreen-image-lightbox";

/**
 * Вложения расходов часто хранятся как data URL - target=_blank с ними в браузерах часто не работает.
 * Открываем в оверлее на весь экран.
 */
export function ExpenseAttachmentOpener({
  url,
  variant,
  text = "Фото",
  buttonClassName,
  thumbClassName,
}: {
  url: string;
  variant: "text" | "thumb" | "thumb-with-caption";
  text?: string;
  buttonClassName?: string;
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FullscreenImageLightbox src={url} open={open} onClose={() => setOpen(false)} alt="Чек / вложение" />
      {variant === "text" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            buttonClassName ??
            "rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:underline dark:text-blue-400"
          }
        >
          {text}
        </button>
      ) : variant === "thumb" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClassName ?? "inline-flex rounded-lg ring-1 ring-[var(--border)]"}
          aria-label={text || "Открыть фото чека"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className={thumbClassName ?? "h-14 w-14 rounded-lg object-cover"}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            buttonClassName ??
            "mt-2 inline-flex items-center gap-2 rounded-lg ring-1 ring-[var(--border)]"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Чек" className={thumbClassName ?? "h-16 w-16 rounded-lg object-cover"} />
          <span className="pr-2 text-xs text-[var(--muted)]">{text}</span>
        </button>
      )}
    </>
  );
}
