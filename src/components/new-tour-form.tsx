"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildTemplateDescription, parseTemplateDescription } from "@/lib/tour-description-share";
import { tourBusinessTodayYmd } from "@/lib/scheduling";
import { TourTemplatePicker } from "@/components/tour-template-picker";
import { TourDateRangePicker } from "@/components/tour-date-range-picker";

type FormState = {
  templateId: string;
  name: string;
  date: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  capacity: string;
  tourType: "group" | "private";
  /** Прайс тура в USD (обязателен, если у выбранного из списка тура нет цены) */
  offerUsd: string;
  usdToVndRate: string;
  customDescription: string;
  customLocations: Array<{ name: string; description: string; mapUrl: string; recommendedTime: string; plusVnd: string }>;
};

/** Совпадает с groupDefaultStartByName("") + add30Minutes, чтобы не было скачка после mount. */
const INITIAL: FormState = {
  templateId: "",
  name: "",
  date: "",
  dateTo: "",
  startTime: "07:00",
  endTime: "07:30",
  capacity: "14",
  tourType: "group",
  offerUsd: "",
  usdToVndRate: "26000",
  customDescription: "",
  customLocations: [],
};

type TourTemplate = {
  id: string;
  name: string;
  description: string;
  shopLabel?: string;
  shopLabels?: string[];
  /** Текст для туриста при отправке квитанции (шаблон). */
  touristSendCopy?: string;
  pickupFrom: string | null;
  pickupTo: string | null;
  defaultPriceVnd: number;
  tourType?: "group" | "private";
  priceCurrency?: "USD" | "VND";
  defaultPriceUsd?: number | null;
};

type TemplateCreateForm = {
  name: string;
  description: string;
  touristSendCopy: string;
  shopLabelsText: string;
  templateLocations: Array<{ name: string; description: string; mapUrl: string; recommendedTime: string; plusVnd: string }>;
  tourType: "group" | "private";
  pickupFrom: string; // group only (start)
  currency: "VND" | "USD";
  defaultPrice: string;
  usdToVndRate: string;
};

const TEMPLATE_INITIAL: TemplateCreateForm = {
  name: "",
  description: "",
  touristSendCopy: "",
  shopLabelsText: "",
  templateLocations: [],
  tourType: "group",
  pickupFrom: "",
  currency: "VND",
  defaultPrice: "0",
  usdToVndRate: "26000",
};

function parseShopLabelsInput(raw: string): string[] {
  return raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatVnd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const s = n.toFixed(2);
  return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function parseMoneyInput(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const digitsAndDot = normalized.replace(/[^\d.]/g, "");
  const [i = "", f = ""] = digitsAndDot.split(".");
  const safe = f ? `${i}.${f.slice(0, 2)}` : i;
  const n = Number(safe);
  return Number.isFinite(n) ? n : 0;
}

function add30Minutes(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(2000, 0, 1, h || 0, m || 0);
  dt.setMinutes(dt.getMinutes() + 30);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function groupDefaultStartByName(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.includes("далат") || n.includes("фуен")) return "05:00";
  return "07:00";
}

function parseRate(raw: string): number {
  const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

function templateHasListPrice(t: TourTemplate | null): boolean {
  if (!t) return false;
  if (t.defaultPriceUsd != null && t.defaultPriceUsd > 0) return true;
  if (t.defaultPriceVnd > 0) return true;
  return false;
}

function usdHintFromTemplate(t: TourTemplate | null, rateStr: string): string {
  if (!t) return "";
  const rate = parseRate(rateStr) || 26000;
  if (t.defaultPriceUsd != null && t.defaultPriceUsd > 0) return formatUsd(t.defaultPriceUsd);
  if (t.defaultPriceVnd > 0) return formatUsd(t.defaultPriceVnd / rate);
  return "";
}

type TemplateBaseline = {
  templateId: string;
  name: string;
  descriptionBlob: string;
  offerUsdHint: string;
  startTime: string;
  skipTimeCompare: boolean;
};

export function NewTourForm({ initialDate = "", viewerRole }: { initialDate?: string; viewerRole?: "manager" | "chief_manager" | string }) {
  const nameFieldId = useId();
  const [form, setForm] = useState<FormState>({ ...INITIAL, date: initialDate });
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<TourTemplate[]>([]);
  const [templatesLoadError, setTemplatesLoadError] = useState<string | null>(null);
  const [canCreateTemplateAllowed, setCanCreateTemplateAllowed] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateCreateForm>(TEMPLATE_INITIAL);
  const [manualTime, setManualTime] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const templateBaselineRef = useRef<TemplateBaseline | null>(null);

  /** Курс USD → VND теперь задаёт бухгалтер централизованно — подтягиваем активный курс, поле в форме тура не редактируется. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/currency-rates/active");
        const j = (await res.json().catch(() => ({}))) as { rate?: number };
        if (cancelled) return;
        const rate = Number(j.rate);
        if (Number.isFinite(rate) && rate >= 1) {
          setForm((s) => ({ ...s, usdToVndRate: String(Math.round(rate)) }));
        }
      } catch {
        // оставляем дефолтный курс из INITIAL
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showTemplateModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showTemplateModal]);

  useEffect(() => {
    if (!initialDate) return;
    setForm((s) => ({ ...s, date: s.date || initialDate }));
  }, [initialDate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tour-templates");
        const json = (await res.json()) as {
          templates?: TourTemplate[];
          canCreateTemplate?: boolean;
          loadError?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setTemplatesLoadError(typeof json.error === "string" ? json.error : `Ошибка ${res.status}`);
          setTemplates([]);
          return;
        }
        setTemplatesLoadError(typeof json.loadError === "string" ? json.loadError : null);
        if (Array.isArray(json.templates)) {
          setTemplates(json.templates);
          setCanCreateTemplateAllowed(Boolean(json.canCreateTemplate));
        }
      } catch {
        if (!cancelled) setTemplatesLoadError("Не удалось связаться с сервером");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickedTemplate = templates.find((t) => t.id === form.templateId) ?? null;
  const fromList = !!pickedTemplate;
  const minTourDate = tourBusinessTodayYmd();

  const cleanedCustomLocations = useMemo(
    () =>
      form.customLocations
        .map((l) => ({
          name: l.name.trim(),
          description: l.description.trim(),
          mapUrl: l.mapUrl.trim(),
          recommendedTime: l.recommendedTime.trim(),
          plusVnd: Math.max(0, Math.round(parseMoneyInput(l.plusVnd))),
        }))
        .filter((l) => l.name && l.mapUrl),
    [form.customLocations],
  );

  const currentDescriptionBlob = useMemo(
    () => buildTemplateDescription(form.customDescription.trim(), cleanedCustomLocations).trim(),
    [form.customDescription, cleanedCustomLocations],
  );

  /** Менеджеры: цена/курс меняются часто — не показываем «страшилки» про шаблон (они для гида на карточке тура). */
  const isSalesManagerUi = viewerRole === "manager" || viewerRole === "chief_manager";

  const baseline = templateBaselineRef.current;
  const descDeviatesFromTemplate = Boolean(
    fromList && baseline && baseline.templateId === form.templateId && currentDescriptionBlob !== baseline.descriptionBlob,
  );
  const timeDeviatesFromTemplate = Boolean(
    fromList &&
      baseline &&
      baseline.templateId === form.templateId &&
      !baseline.skipTimeCompare &&
      form.startTime !== baseline.startTime,
  );
  /** Отличие от шаблона только по маршруту/локациям и времени сбора. Цена USD и курс не считаются нарушением шаблона. */
  const deviatesFromTemplate =
    fromList && baseline && baseline.templateId === form.templateId
      ? descDeviatesFromTemplate || timeDeviatesFromTemplate
      : false;
  const nameMatchesTemplateName = Boolean(
    fromList && pickedTemplate && form.name.trim() === pickedTemplate.name.trim(),
  );
  const blockSubmitCustomWithoutDistinctName =
    !isSalesManagerUi && deviatesFromTemplate && nameMatchesTemplateName;

  function applyTemplate(t: TourTemplate | null, explicitRate?: string) {
    if (!t) {
      templateBaselineRef.current = null;
      setForm((s) => ({ ...s, templateId: "" }));
      setManualTime(false);
      setShowAdvanced(false);
      return;
    }
    setForm((s) => {
      const rateForHint = explicitRate?.trim() ? explicitRate : s.usdToVndRate;
      const hint = usdHintFromTemplate(t, rateForHint);
      const parsed = parseTemplateDescription(t.description || "");
      const descriptionBlob = buildTemplateDescription(parsed.description, parsed.locations).trim();
      const startTime = t.pickupFrom ? t.pickupFrom.slice(0, 5) : s.startTime;
      const endTime = t.pickupTo
        ? t.pickupTo.slice(0, 5)
        : t.pickupFrom
          ? add30Minutes(t.pickupFrom.slice(0, 5))
          : s.endTime;
      templateBaselineRef.current = {
        templateId: t.id,
        name: t.name.trim(),
        descriptionBlob,
        offerUsdHint: hint,
        startTime,
        skipTimeCompare: !t.pickupFrom,
      };
      return {
        ...s,
        templateId: t.id,
        name: t.name,
        tourType: t.tourType === "private" ? "private" : "group",
        startTime,
        endTime,
        ...(explicitRate?.trim() ? { usdToVndRate: explicitRate.trim() } : {}),
        offerUsd: hint || s.offerUsd,
        customDescription: parsed.description,
        customLocations: parsed.locations.map((l) => ({
          name: l.name,
          description: l.description,
          mapUrl: l.mapUrl,
          recommendedTime: l.recommendedTime || "",
          plusVnd: l.plusVnd ? String(l.plusVnd) : "",
        })),
      };
    });
    setManualTime(true);
    setShowAdvanced(false);
  }
  const rateForPreview = parseRate(form.usdToVndRate) || 26000;
  const usdForPreview = parseMoneyInput(form.offerUsd);
  const vndPreview = usdForPreview > 0 ? Math.round(usdForPreview * rateForPreview) : 0;

  useEffect(() => {
    if (fromList) return;
    if (form.tourType !== "group") return;
    if (manualTime) return;
    const start = groupDefaultStartByName(form.name);
    setForm((s) => ({ ...s, startTime: start, endTime: add30Minutes(start) }));
  }, [form.name, form.tourType, fromList, manualTime]);

  async function onCreateTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTemplateBusy(true);
    try {
      const res = await fetch("/api/tour-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateForm.name,
          description: templateForm.description,
          shopLabels: parseShopLabelsInput(templateForm.shopLabelsText),
          touristSendCopy: templateForm.touristSendCopy,
          templateLocations: templateForm.templateLocations
            .map((l) => ({
              name: l.name.trim(),
              description: l.description.trim(),
              mapUrl: l.mapUrl.trim(),
              recommendedTime: l.recommendedTime.trim(),
              plusVnd: Math.max(0, Math.round(parseMoneyInput(l.plusVnd))),
            }))
            .filter((l) => l.name),
          tourType: templateForm.tourType,
          pickupFrom: templateForm.tourType === "group" ? templateForm.pickupFrom || "" : "",
          currency: templateForm.currency,
          defaultPrice:
            templateForm.currency === "VND"
              ? Math.round(parseMoneyInput(templateForm.defaultPrice))
              : parseMoneyInput(templateForm.defaultPrice),
          usdToVndRate: templateForm.usdToVndRate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось создать шаблон");
      }
      const created = json.template as TourTemplate | undefined;
      if (created) {
        setTemplates((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
        applyTemplate(created, templateForm.usdToVndRate);
      }
      setShowTemplateModal(false);
      setTemplateForm(TEMPLATE_INITIAL);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blockSubmitCustomWithoutDistinctName) {
      alert(
        "Вы изменили маршрут, цену или время относительно шаблона — укажите другое название выезда, чтобы гид не спутал его со стандартным туром.",
      );
      return;
    }
    if (!form.name.trim()) {
      alert("Введите название тура.");
      return;
    }
    if (!form.date) {
      alert("Выберите дату тура.");
      return;
    }
    if (form.date < minTourDate) {
      alert("Нельзя создавать тур в прошедшей дате.");
      return;
    }
    if (form.dateTo && form.dateTo < form.date) {
      alert("Дата окончания должна быть не раньше даты начала.");
      return;
    }
    if (fromList && pickedTemplate && !pickedTemplate.pickupFrom) {
      if (!form.startTime) {
        alert("Укажите время сбора.");
        return;
      }
    }
    if (!form.startTime) {
      alert("Укажите время сбора.");
      return;
    }
    const usdNum = parseMoneyInput(form.offerUsd);
    if (usdNum <= 0 && !templateHasListPrice(pickedTemplate)) {
      alert("Укажите цену тура в долларах или выберите тур из списка с указанной ценой.");
      return;
    }
    const groupEnd = add30Minutes(form.startTime);
    setBusy(true);
    try {
      const res = await fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: form.templateId || "",
          name: form.name,
          date: form.date,
          dateTo: form.dateTo || form.date,
          startTime: form.startTime,
          endTime: form.tourType === "group" ? groupEnd : "",
          capacity: form.capacity,
          tourType: form.tourType,
          ...(usdNum > 0 ? { offerUsd: usdNum } : {}),
          ...(fromList
            ? descDeviatesFromTemplate
              ? {
                  tourDescriptionOverride: buildTemplateDescription(
                    form.customDescription.trim(),
                    cleanedCustomLocations,
                  ),
                }
              : {}
            : {
                customDescription: form.customDescription,
                customLocations: cleanedCustomLocations,
              }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось сохранить");
      }
      if (json.createdCount && Number(json.createdCount) > 1) {
        alert(`Открыто туров: ${json.createdCount}`);
      }
      window.location.href = `/tours/${json.tourId}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="card space-y-2">
        {canCreateTemplateAllowed ? (
          <button
            type="button"
            onClick={() => setShowTemplateModal(true)}
            className="w-full rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
          >
            Создать шаблон
          </button>
        ) : null}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
            Шаблон тура
          </label>
          <TourTemplatePicker
            templates={templates.map(t => ({ id: t.id, name: t.name, priceCurrency: t.priceCurrency, defaultPriceUsd: t.defaultPriceUsd, defaultPriceVnd: t.defaultPriceVnd, tourType: t.tourType, pickupFrom: t.pickupFrom }))}
            selectedId={form.templateId}
            onSelect={(picked) => {
              const full = templates.find(t => t.id === picked.id) ?? null;
              applyTemplate(full);
            }}
            onClear={() => applyTemplate(null)}
          />
          {/* скрытый select чтобы не ломать остальной код */}
          <select
            value={form.templateId}
            onChange={(e) => {
              const id = e.target.value;
              const t = id ? templates.find((x) => x.id === id) ?? null : null;
              applyTemplate(t);
            }}
            className="hidden"
            aria-hidden="true"
          >
            <option value="">—</option>
            {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
          {templatesLoadError ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{templatesLoadError}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]" htmlFor={nameFieldId}>
            Название выезда
          </label>
          <input
            id={nameFieldId}
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            autoComplete="off"
            placeholder={fromList ? "Как у шаблона или своё, если выезд нестандартный" : "Например Далат — артишок VIP"}
            className="field-surface w-full rounded-xl px-3 py-2"
          />
          {fromList && pickedTemplate && !isSalesManagerUi ? (
            <div className="flex flex-wrap items-center gap-2">
              {!deviatesFromTemplate ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-950 ring-1 ring-emerald-300/70 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-700/50">
                  Как в шаблоне
                </span>
              ) : (
                <>
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-300/70 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-700/50">
                    Отличается от шаблона
                  </span>
                  {blockSubmitCustomWithoutDistinctName ? (
                    <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                      Задайте другое название — по нему гид поймёт, что выезд не стандартный.
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--muted)]">
                      Название изменено — хорошо видно в списке туров.
                    </span>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
        {fromList && pickedTemplate && !showAdvanced ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Маршрут и комментарии</p>
            <div className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-[var(--text)]">
              {form.customDescription.trim() || (
                <span className="text-[var(--muted)]">Текст описания не заполнен.</span>
              )}
            </div>
            {cleanedCustomLocations.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-[var(--border)]/60 pt-3 text-sm">
                {cleanedCustomLocations.map((loc, i) => (
                  <li key={`${loc.mapUrl}-${i}`} className="text-[var(--text)]">
                    <span className="font-medium">{i + 1}. {loc.name}</span>
                    {loc.description ? (
                      <span className="mt-0.5 block whitespace-pre-wrap text-[13px] text-[var(--muted)]">{loc.description}</span>
                    ) : null}
                    {loc.recommendedTime ? (
                      <span className="mt-0.5 block text-[12px] text-[var(--muted)]">Рекомендуемое время: {loc.recommendedTime}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">Локации с картами можно добавить в разделе «Дополнительно».</p>
            )}
          </div>
        ) : null}
        {fromList ? (
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-left text-sm text-[var(--text)] ring-1 ring-black/[0.04] hover:bg-[var(--surface-elevated)] dark:ring-white/[0.06]"
          >
            <span className="font-medium">{showAdvanced ? "Скрыть дополнительные поля" : "Дополнительно"}</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Описание, локации и точки на карте — если нужно изменить маршрут относительно шаблона.
            </span>
          </button>
        ) : null}
        <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
            Цена тура, USD <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            value={form.offerUsd}
            onChange={(e) => {
              const raw = e.target.value;
              setForm((s) => ({ ...s, offerUsd: raw.replace(/[^\d.,]/g, "") }));
            }}
            inputMode="decimal"
            placeholder="Например 80"
            className="field-surface w-full rounded-xl px-3 py-2"
          />
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Курс USD → VND: <span className="font-semibold tabular-nums text-[var(--text)]">{form.usdToVndRate || "26000"}</span>{" "}
            <span className="text-[var(--muted2)]">— устанавливает бухгалтер, в форме тура не меняется</span>
          </p>
          {vndPreview > 0 ? (
            <p className="text-xs text-[var(--muted)]">
              ≈ <span className="font-semibold tabular-nums text-[var(--text)]">{formatVnd(vndPreview)}</span> ₫ по
              текущему курсу в форме
            </p>
          ) : pickedTemplate && templateHasListPrice(pickedTemplate) ? (
            <p className="text-xs text-[var(--muted)]">
              Можно оставить USD пустым - подставится цена из выбранного тура в списке (курс ниже всё равно
              применится при сохранении).
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">Укажите сумму в долларах - в донгах посчитаем автоматически.</p>
          )}
        </div>
        {((showAdvanced && fromList) || (!fromList && (viewerRole === "manager" || viewerRole === "chief_manager"))) ? (
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              {fromList ? "Правки маршрута для этого выезда" : "Кастомный маршрут тура"}
            </div>
            <textarea
              value={form.customDescription}
              onChange={(e) => setForm((s) => ({ ...s, customDescription: e.target.value }))}
              placeholder="Описание маршрута"
              className="field-surface w-full rounded-xl px-3 py-2"
              rows={3}
            />
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-secondary !min-h-[34px] !rounded-lg !px-2.5 !py-1 text-xs"
                onClick={() =>
                  setForm((s) => ({
                    ...s,
                    customLocations: [...s.customLocations, { name: "", description: "", mapUrl: "", recommendedTime: "", plusVnd: "" }],
                  }))
                }
              >
                + Локация
              </button>
            </div>
            {form.customLocations.length > 0 ? (
              <div className="space-y-2">
                {form.customLocations.map((loc, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Локация {idx + 1}</div>
                      <button
                        type="button"
                        className="btn-secondary !min-h-[28px] !rounded-lg !px-2 !py-1 text-[11px]"
                        onClick={() =>
                          setForm((s) => ({
                            ...s,
                            customLocations: s.customLocations.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Удалить
                      </button>
                    </div>
                    <input
                      value={loc.name}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          customLocations: s.customLocations.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                        }))
                      }
                      placeholder="Название места"
                      className="field-surface w-full rounded-xl px-3 py-2"
                    />
                    <textarea
                      value={loc.description}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          customLocations: s.customLocations.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x,
                          ),
                        }))
                      }
                      placeholder="Описание места"
                      className="field-surface mt-2 w-full rounded-xl px-3 py-2"
                      rows={2}
                    />
                    <input
                      value={loc.mapUrl}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          customLocations: s.customLocations.map((x, i) => (i === idx ? { ...x, mapUrl: e.target.value } : x)),
                        }))
                      }
                      placeholder="Google Maps ссылка"
                      className="field-surface mt-2 w-full rounded-xl px-3 py-2"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        value={loc.recommendedTime}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            customLocations: s.customLocations.map((x, i) =>
                              i === idx ? { ...x, recommendedTime: e.target.value } : x,
                            ),
                          }))
                        }
                        type="time"
                        placeholder="Реком. время"
                        className="field-surface w-full rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">Добавьте точки и ссылки, чтобы гид и диспетчер могли копировать маршрут.</p>
            )}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 min-w-0">
            <TourDateRangePicker
              dateFrom={form.date}
              dateTo={form.dateTo || form.date}
              minDate={minTourDate}
              onChange={(from, to) => setForm((s) => ({ ...s, date: from, dateTo: to === from ? "" : to }))}
            />
          </div>
          <div className="hidden min-w-0">
            <input
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
              type="date"
              min={minTourDate}
              className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2"
              aria-label="Дата тура (с)"
            />
            <p className="mt-1 text-[10px] text-[var(--muted2)]">С: ДД.ММ.ГГГГ</p>
          </div>
          <div className="min-w-0">
            <select
              value={form.tourType}
              onChange={(e) => {
                const nextType = e.target.value as "group" | "private";
                setForm((s) => {
                  if (nextType === "group" && !fromList) {
                    const start = manualTime ? s.startTime : groupDefaultStartByName(s.name);
                    return { ...s, tourType: nextType, startTime: start, endTime: add30Minutes(start) };
                  }
                  return { ...s, tourType: nextType };
                });
              }}
              className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2"
            >
              <option value="group">Групповой</option>
              <option value="private">Приватный</option>
            </select>
            <p className="mt-1 text-[10px] text-[var(--muted2)]">Тип тура</p>
          </div>
        </div>
        <div className="hidden">
          <input value={form.dateTo} onChange={(e) => setForm((s) => ({ ...s, dateTo: e.target.value }))} type="date" aria-label="Дата тура (по)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <input
              value={form.startTime}
              onChange={(e) => {
                const nextStart = e.target.value;
                setManualTime(true);
                setForm((s) => ({ ...s, startTime: nextStart, endTime: add30Minutes(nextStart) }));
              }}
              type="time"
              className="field-surface w-full rounded-xl px-3 py-2"
              aria-label={form.tourType === "group" ? "Сбор с" : "Время сбора"}
            />
            <p className="mt-1 text-[10px] text-[var(--muted2)]">
              {fromList && pickedTemplate?.pickupFrom
                ? `Шаблон: ${pickedTemplate.pickupFrom.slice(0, 5)} — ${add30Minutes(pickedTemplate.pickupFrom.slice(0, 5))} · можно изменить`
                : form.tourType === "group"
                  ? "Начало окна сбора"
                  : "Время"}
            </p>
          </div>
          <div className="min-w-0">
          <select
            value={form.capacity}
            onChange={(e) => setForm((s) => ({ ...s, capacity: e.target.value }))}
            className="field-surface w-full rounded-xl px-3 py-2"
            aria-label="Число мест"
          >
            {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
            <p className="mt-1 text-[10px] text-[var(--muted2)]">Число мест / туристов</p>
          </div>
        </div>
        {form.tourType === "group" ? (
          <div className="text-xs text-[var(--muted)]">Окно сбора: {form.startTime} - {add30Minutes(form.startTime)}</div>
        ) : null}
        <button
          disabled={busy || blockSubmitCustomWithoutDistinctName}
          className="btn-primary w-full rounded-xl px-4 py-2 disabled:opacity-50"
          type="submit"
        >
          {busy ? "Сохранение..." : "Открыть тур"}
        </button>
      </form>

      {showTemplateModal ? (
        <div
          className="ui-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTemplateModal(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text)]">Создать шаблон</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                Закрыть
              </button>
            </div>
            <form onSubmit={onCreateTemplate} className="space-y-2">
              <select
                value={templateForm.tourType}
                onChange={(e) => setTemplateForm((s) => ({ ...s, tourType: e.target.value as "group" | "private" }))}
                className="field-surface w-full rounded-xl px-3 py-2"
              >
                <option value="group">Групповой</option>
                <option value="private">Приватный</option>
              </select>
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Название шаблона"
                className="field-surface w-full rounded-xl px-3 py-2"
                required
              />
              <textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Описание"
                className="field-surface w-full rounded-xl px-3 py-2"
              />
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                  Сообщение туристу (с квитанцией)
                </label>
                <textarea
                  value={templateForm.touristSendCopy}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, touristSendCopy: e.target.value }))}
                  placeholder="Время выезда, что взять с собой — кнопка «Инфо» на карточке брони и текст в WhatsApp."
                  className="field-surface w-full rounded-xl px-3 py-2"
                  rows={4}
                />
              </div>
              <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                    Локации по порядку (для гида/диспетчера)
                  </div>
                  <button
                    type="button"
                    className="btn-secondary !min-h-[34px] !rounded-lg !px-2.5 !py-1 text-xs"
                    onClick={() =>
                      setTemplateForm((s) => ({
                        ...s,
                        templateLocations: [...s.templateLocations, { name: "", description: "", mapUrl: "", recommendedTime: "", plusVnd: "" }],
                      }))
                    }
                  >
                    + Локация
                  </button>
                </div>
                {templateForm.templateLocations.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Добавьте точки маршрута: название, описание, ссылка Google Maps.</p>
                ) : (
                  <div className="space-y-2">
                    {templateForm.templateLocations.map((loc, idx) => (
                      <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                          Локация {idx + 1}
                        </div>
                        <input
                          value={loc.name}
                          onChange={(e) =>
                            setTemplateForm((s) => ({
                              ...s,
                              templateLocations: s.templateLocations.map((x, i) =>
                                i === idx ? { ...x, name: e.target.value } : x,
                              ),
                            }))
                          }
                          placeholder="Название места"
                          className="field-surface w-full rounded-xl px-3 py-2"
                        />
                        <textarea
                          value={loc.description}
                          onChange={(e) =>
                            setTemplateForm((s) => ({
                              ...s,
                              templateLocations: s.templateLocations.map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x,
                              ),
                            }))
                          }
                          placeholder="Описание места (для менеджера/команды)"
                          className="field-surface mt-2 w-full rounded-xl px-3 py-2"
                          rows={2}
                        />
                        <input
                          value={loc.mapUrl}
                          onChange={(e) =>
                            setTemplateForm((s) => ({
                              ...s,
                              templateLocations: s.templateLocations.map((x, i) =>
                                i === idx ? { ...x, mapUrl: e.target.value } : x,
                              ),
                            }))
                          }
                          placeholder="Ссылка Google Maps"
                          className="field-surface mt-2 w-full rounded-xl px-3 py-2"
                        />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            value={loc.recommendedTime}
                            onChange={(e) =>
                              setTemplateForm((s) => ({
                                ...s,
                                templateLocations: s.templateLocations.map((x, i) =>
                                  i === idx ? { ...x, recommendedTime: e.target.value } : x,
                                ),
                              }))
                            }
                            type="time"
                            placeholder="Реком. время"
                            className="field-surface w-full rounded-xl px-3 py-2"
                          />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() =>
                              setTemplateForm((s) => ({
                                ...s,
                                templateLocations: s.templateLocations.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            Удалить локацию
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                  Официальные магазины (можно несколько)
                </div>
                <textarea
                  value={templateForm.shopLabelsText}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, shopLabelsText: e.target.value }))}
                  placeholder={"По одному магазину в строке\nНапример:\nДалат - Артишок тур ВИП\n3 магазина с разными артишоками"}
                  className="field-surface w-full rounded-xl px-3 py-2"
                  rows={3}
                />
                <p className="text-[11px] text-[var(--muted2)]">
                  В карточке тура можно будет быстро выбрать нужный магазин из этого списка.
                </p>
              </label>
              {templateForm.tourType === "group" ? (
                <input
                  value={templateForm.pickupFrom}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, pickupFrom: e.target.value }))}
                  type="time"
                  className="field-surface w-full rounded-xl px-3 py-2"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={templateForm.currency}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, currency: e.target.value as "VND" | "USD" }))}
                  className="field-surface w-full rounded-xl px-3 py-2"
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  value={templateForm.defaultPrice}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (templateForm.currency === "VND") {
                      const n = Math.round(parseMoneyInput(raw));
                      setTemplateForm((s) => ({ ...s, defaultPrice: n ? formatVnd(n) : "" }));
                      return;
                    }
                    setTemplateForm((s) => ({ ...s, defaultPrice: raw }));
                  }}
                  inputMode={templateForm.currency === "USD" ? "decimal" : "numeric"}
                  placeholder={templateForm.currency === "USD" ? "80" : "1.000.000"}
                  className="field-surface w-full rounded-xl px-3 py-2"
                />
              </div>
              {templateForm.currency === "USD" ? (
                <input
                  value={templateForm.usdToVndRate}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, usdToVndRate: e.target.value }))}
                  inputMode="numeric"
                  placeholder="26000"
                  className="field-surface w-full rounded-xl px-3 py-2"
                />
              ) : null}
              <button
                disabled={templateBusy}
                className="btn-primary w-full rounded-xl px-4 py-2 disabled:opacity-50"
                type="submit"
              >
                {templateBusy ? "Сохранение..." : "Создать шаблон"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
