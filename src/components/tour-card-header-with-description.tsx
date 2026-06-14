"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TourDescriptionPanelContent } from "@/components/tour-description-actions";
import type { Role } from "@/lib/types";
import { parseTemplateDescription } from "@/lib/tour-description-share";

type Props = {
  children: ReactNode;
  statusChip: ReactNode;
  templateId: string | null | undefined;
  /** Если задано (например tours.description_override), не запрашиваем текст у шаблона */
  prefetchedDescriptionText?: string | null;
  tourName: string;
  tourDateLabel: string;
  pickupWindow?: string;
  viewerRole?: Role;
};

export function TourCardHeaderWithDescription({
  children,
  statusChip,
  templateId,
  prefetchedDescriptionText,
  tourName,
  tourDateLabel,
  pickupWindow,
  viewerRole,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locationsBusy, setLocationsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [descriptionText, setDescriptionText] = useState("");
  const cacheRef = useRef<Map<string, string>>(new Map());
  const canQuickCopyLocations =
    viewerRole === "guide" ||
    viewerRole === "chief_guide" ||
    viewerRole === "dispatcher" ||
    viewerRole === "booking_dispatcher";

  async function loadDescriptionForTemplate(id: string): Promise<string> {
    const cached = cacheRef.current.get(id);
    if (cached !== undefined) return cached;
    const res = await fetch(`/api/tour-templates/${encodeURIComponent(id)}/description`);
    const j = (await res.json()) as { description?: unknown; error?: unknown };
    if (!res.ok) {
      throw new Error(typeof j.error === "string" ? j.error : "Не удалось загрузить описание");
    }
    const d = typeof j.description === "string" ? j.description : "";
    cacheRef.current.set(id, d);
    return d;
  }

  useEffect(() => {
    if (!expanded) return;

    const prefetch = prefetchedDescriptionText?.trim();
    if (prefetch) {
      setDescriptionText(prefetch);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    if (!templateId) return;

    const cached = cacheRef.current.get(templateId);
    if (cached !== undefined) {
      setDescriptionText(cached);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const d = await loadDescriptionForTemplate(templateId);
        if (!cancelled) {
          setDescriptionText(d);
        }
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : "Ошибка");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, templateId, prefetchedDescriptionText]);

  async function onCopyLocations(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const prefetch = prefetchedDescriptionText?.trim();
    if (!templateId && !prefetch) return;
    try {
      setLocationsBusy(true);
      const d =
        prefetch ||
        (templateId ? await loadDescriptionForTemplate(templateId) : "");
      const parsed = parseTemplateDescription(d);
      if (parsed.locations.length === 0) {
        alert("В описании шаблона нет локаций.");
        return;
      }
      const text = parsed.locations
        .map((l, i) =>
          [
            `${i + 1}. ${l.name}`,
            l.description || "",
            l.recommendedTime ? `Рекомендуемое время: ${l.recommendedTime}` : "",
            l.plusVnd && l.plusVnd > 0 ? `Плюсик: ${l.plusVnd.toLocaleString("ru-RU")} ₫` : "",
            l.mapUrl,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n");
      await navigator.clipboard.writeText(text);
      alert("Локации скопированы");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLocationsBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between md:gap-3">
        <div className="min-w-0 flex-1 pointer-events-none">{children}</div>
        <div className="pointer-events-auto relative z-[3] flex w-full shrink-0 flex-col items-stretch gap-2 md:w-[11rem]">
          {statusChip}
          {templateId || prefetchedDescriptionText?.trim() ? (
            <>
              {canQuickCopyLocations ? (
                <button
                  type="button"
                  onClick={(e) => void onCopyLocations(e)}
                  disabled={locationsBusy}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-950 ring-1 ring-teal-200/90 transition-colors hover:bg-teal-100/90 disabled:opacity-50 dark:bg-teal-950/45 dark:text-teal-50 dark:ring-teal-600/45 dark:hover:bg-teal-900/55"
                >
                  {locationsBusy ? "..." : "Локации"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)]"
              >
                {expanded ? "Свернуть описание" : "Описание тура"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {(templateId || prefetchedDescriptionText?.trim()) && expanded ? (
        <div
          className="pointer-events-auto relative z-[3] mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 dark:bg-[var(--surface-elevated)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Описание тура</div>
          <TourDescriptionPanelContent
            tourName={tourName}
            tourDate={tourDateLabel}
            pickupWindow={pickupWindow}
            descriptionText={descriptionText}
            loading={loading}
            errorMessage={errorMessage}
            viewerRole={viewerRole}
          />
        </div>
      ) : null}
    </>
  );
}
