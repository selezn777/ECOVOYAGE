"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { receiptFileToJpegDataUrl } from "@/lib/receipt-image-compress";
import type { GuideSalaryRecord, Role } from "@/lib/types";
import { parseShopExtraNote } from "@/lib/shop-salary-note-parse";
import { showConfirm } from "@/lib/ui-dialog";

function parseShopLabels(raw: string | null | undefined): string[] {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(/\s*(?:\||,|;|\n)\s*/g)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function parsePercentInput(s: string): number {
  const x = Number(String(s || "").replace(",", ".").trim());
  return Number.isFinite(x) ? x : 0;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

export function TourGuideExtraEarningsPanel({
  tourId,
  shopLabel,
  initialOfficialAccruedVnd,
  initialOfficialPaidVnd,
  initialTotalAccruedVnd,
  initialTotalPaidVnd,
  records,
  viewerRole,
  tourClosed,
}: {
  tourId: string;
  shopLabel?: string | null;
  initialOfficialAccruedVnd: number;
  initialOfficialPaidVnd: number;
  initialTotalAccruedVnd: number;
  initialTotalPaidVnd: number;
  records?: GuideSalaryRecord[];
  viewerRole: Role;
  tourClosed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [collapsed, setCollapsed] = useState(true);

  // Редактирование одной конкретной записи “вне магазина”.
  const [levalsEditId, setLevalsEditId] = useState<string | null>(null);
  const [shopEditId, setShopEditId] = useState<string | null>(null);

  const MAX_PICK_BYTES = 12 * 1024 * 1024;

  // Рядки должны быть свернуты вначале, если сумма = 0.
  const [shopOpen, setShopOpen] = useState(false);
  const [levalsOpen, setLevalsOpen] = useState(false);

  const [showTotal, setShowTotal] = useState(false);
  const [shopHasValue, setShopHasValue] = useState(false);
  const [shopOfficePctStr, setShopOfficePctStr] = useState("40");
  const [shopDriverPctStr, setShopDriverPctStr] = useState("20");
  const [driverModalRecordId, setDriverModalRecordId] = useState<string | null>(null);
  const [driverPaidStr, setDriverPaidStr] = useState("");

  // ---- Магазин (Далат) ----
  const [shopProfitStr, setShopProfitStr] = useState("");
  const [shopWhereNote, setShopWhereNote] = useState("");
  const [shopSettlement, setShopSettlement] = useState<"guide_kept" | "office_received">("guide_kept");
  const [shopReceiptFile, setShopReceiptFile] = useState<File | null>(null);
  const [shopReceiptPreviewUrl, setShopReceiptPreviewUrl] = useState<string | null>(null);

  // ---- Вне магазина ----
  const [levalsTotalStr, setLevalsTotalStr] = useState("");
  const [levalsDriverMode, setLevalsDriverMode] = useState<"percent" | "fixed">("percent");
  const [levalsDriverPercentStr, setLevalsDriverPercentStr] = useState("10");
  const [levalsDriverFixedStr, setLevalsDriverFixedStr] = useState("");
  const [levalsWhereNote, setLevalsWhereNote] = useState("");

  const shopProfitVnd = useMemo(() => parseVndInput(shopProfitStr), [shopProfitStr]);
  const shopLabelOptions = useMemo(() => parseShopLabels(shopLabel), [shopLabel]);
  const defaultShopLabel = shopLabelOptions[0] || (shopLabel || "магазин").trim() || "магазин";

  const shopOfficePct = useMemo(() => {
    const x = parsePercentInput(shopOfficePctStr);
    return Math.max(0, Math.min(100, Math.round(x)));
  }, [shopOfficePctStr]);
  const shopDriverPct = useMemo(() => {
    const x = parsePercentInput(shopDriverPctStr);
    return Math.max(0, Math.min(100, Math.round(x)));
  }, [shopDriverPctStr]);
  const shopOfficeVnd = useMemo(() => Math.round((shopProfitVnd * shopOfficePct) / 100), [shopProfitVnd, shopOfficePct]);
  const shopDriverVnd = useMemo(() => Math.round((shopProfitVnd * shopDriverPct) / 100), [shopProfitVnd, shopDriverPct]);
  const shopGuideVnd = useMemo(() => shopProfitVnd - shopOfficeVnd - shopDriverVnd, [shopProfitVnd, shopOfficeVnd, shopDriverVnd]);

  const levalsTotalVnd = useMemo(() => parseVndInput(levalsTotalStr), [levalsTotalStr]);
  const levalsDriverPercent = useMemo(() => {
    const x = parsePercentInput(levalsDriverPercentStr);
    return Math.max(0, Math.min(100, x));
  }, [levalsDriverPercentStr]);
  const levalsDriverFixedVnd = useMemo(() => parseVndInput(levalsDriverFixedStr), [levalsDriverFixedStr]);
  const levalsDriverVnd = useMemo(() => {
    if (levalsDriverMode === "fixed") return levalsDriverFixedVnd;
    return Math.round((levalsTotalVnd * levalsDriverPercent) / 100);
  }, [levalsDriverMode, levalsDriverFixedVnd, levalsTotalVnd, levalsDriverPercent]);
  const levalsGuideVnd = useMemo(() => levalsTotalVnd - levalsDriverVnd, [levalsTotalVnd, levalsDriverVnd]);

  const levalsRecords = useMemo(() => {
    return (records ?? []).filter((r) => r.kind === "levals").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records]);

  const shopRecords = useMemo(() => {
    return (records ?? []).filter((r) => r.kind === "shop").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records]);

  const hasPrivateExtra = levalsRecords.length > 0;
  const levalsDataSig = useMemo(() => levalsRecords.map((r) => r.id).join(","), [levalsRecords]);

  const accountantTourSalaryRecords = useMemo(() => {
    return (records ?? []).filter((r) => r.kind === "accountant_tour").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records]);

  useEffect(() => {
    if (shopProfitVnd >= 1) {
      setShopHasValue(true);
      setShopOpen(true);
    } else if (shopHasValue) {
      setShopOpen(false);
    }
  }, [shopProfitVnd, shopHasValue]);

  useEffect(() => {
    if (levalsRecords.length > 0) setLevalsOpen(false);
  }, [levalsDataSig, levalsRecords.length]);

  useEffect(() => {
    if (!shopReceiptFile) {
      setShopReceiptPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(shopReceiptFile);
    setShopReceiptPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shopReceiptFile]);

  const editingShopAttachmentOk = shopEditId
    ? Boolean(shopReceiptFile) || Boolean(shopRecords.find((r) => r.id === shopEditId)?.attachmentUrl)
    : false;
  const canSaveShop =
    !busy &&
    shopProfitVnd >= 1 &&
    shopGuideVnd >= 0 &&
    shopOfficePct + shopDriverPct <= 100 &&
    (shopEditId ? editingShopAttachmentOk : Boolean(shopReceiptFile));

  const canSaveLevals =
    !busy &&
    levalsTotalVnd >= 1 &&
    levalsGuideVnd > 0 &&
    levalsWhereNote.trim().length >= 1;
  const leadershipCanEdit = viewerRole === "director" || viewerRole === "chief_manager";
  const guideCanDefineShopSplit = leadershipCanEdit;
  const canEditNow = !tourClosed || leadershipCanEdit;

  async function submitShop() {
    if (!canSaveShop) return;
    setBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (shopReceiptFile) {
        if (shopReceiptFile.size > MAX_PICK_BYTES) {
          alert("Фото больше 12 МБ - выберите файл поменьше.");
          return;
        }
        attachmentDataUrl = await receiptFileToJpegDataUrl(shopReceiptFile);
      }

      const res = shopEditId
        ? await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateShop",
              recordId: shopEditId,
              shopProfitVnd,
              settlement: shopSettlement,
              shopOfficePercent: shopOfficePct,
              shopDriverPercent: shopDriverPct,
              ...(shopWhereNote.trim() ? { whereNote: shopWhereNote.trim() } : {}),
              ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
            }),
          })
        : await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "shop",
              shopProfitVnd,
              settlement: shopSettlement,
              shopOfficePercent: shopOfficePct,
              shopDriverPercent: shopDriverPct,
              attachmentDataUrl: attachmentDataUrl!,
              ...(shopWhereNote.trim() ? { whereNote: shopWhereNote.trim() } : {}),
            }),
          });

      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string; id?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };

      if (!res.ok) {
        alert(j.error || `Не удалось сохранить (ошибка ${res.status})`);
        return;
      }

      const wasEdit = Boolean(shopEditId);
      const settleSnap = shopSettlement;
      const newId = typeof j.id === "string" ? j.id : null;
      setShopProfitStr("");
      setShopWhereNote("");
      setShopSettlement("guide_kept");
      setShopOfficePctStr("40");
      setShopDriverPctStr("20");
      setShopReceiptFile(null);
      setShopEditId(null);
      router.refresh();
      if (!wasEdit && settleSnap === "guide_kept" && newId) {
        setDriverModalRecordId(newId);
        setDriverPaidStr("");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
    }
  }

  async function submitLevals() {
    if (!canSaveLevals) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
        method: levalsEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          levalsEditId
            ? {
                action: "updateLevals",
                recordId: levalsEditId,
                levalsTotalVnd,
                levalsDriverMode,
                ...(levalsDriverMode === "percent" ? { levalsDriverPercent } : {}),
                ...(levalsDriverMode === "fixed" ? { levalsDriverFixedVnd } : {}),
                whereNote: levalsWhereNote,
              }
            : {
                mode: "levals",
                levalsTotalVnd,
                levalsDriverMode,
                ...(levalsDriverMode === "percent" ? { levalsDriverPercent } : {}),
                ...(levalsDriverMode === "fixed" ? { levalsDriverFixedVnd } : {}),
                whereNote: levalsWhereNote,
              },
        ),
      });

      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        alert(j.error || `Не удалось сохранить (ошибка ${res.status})`);
        return;
      }

      // Сбрасываем вне-магазин строку.
      setLevalsTotalStr("");
      setLevalsWhereNote("");
      setLevalsDriverMode("percent");
      setLevalsDriverPercentStr("10");
      setLevalsDriverFixedStr("");
      setLevalsEditId(null);
      setLevalsOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShopRecord(recordId: string) {
    const ok = await showConfirm("Удалить эту запись по магазину? После закрытия карточки тура правки доступны только руководству.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Не удалось удалить (ошибка ${res.status})`);
        return;
      }
      if (shopEditId === recordId) {
        setShopEditId(null);
        setShopProfitStr("");
        setShopWhereNote("");
        setShopReceiptFile(null);
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
    }
  }

  function parseShopPercentsFromNote(note: string | null | undefined): { office: number; driver: number } {
    const n = note ?? "";
    const o = n.match(/офис=(\d+)%/);
    const d = n.match(/водитель=(\d+)%/);
    return {
      office: o ? Math.min(100, Math.max(0, Number(o[1]))) : 40,
      driver: d ? Math.min(100, Math.max(0, Number(d[1]))) : 20,
    };
  }

  function startEditShop(r: GuideSalaryRecord) {
    const parsed = parseShopExtraNote(r.note);
    const pr = parseShopPercentsFromNote(r.note);
    setShopEditId(r.id);
    setShopProfitStr(parsed.profitVnd != null && parsed.profitVnd > 0 ? formatVndInput(parsed.profitVnd) : "");
    setShopWhereNote(extractWhereFromNote(r.note));
    setShopSettlement(parsed.settlement ?? "guide_kept");
    setShopOfficePctStr(String(pr.office));
    setShopDriverPctStr(String(pr.driver));
    setShopReceiptFile(null);
    setShopOpen(true);
  }

  async function submitDriverPaidModal() {
    if (!driverModalRecordId) return;
    const v = parseVndInput(driverPaidStr);
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setShopDriverPaid",
          recordId: driverModalRecordId,
          shopDriverPaidByGuideVnd: v,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Не удалось сохранить");
        return;
      }
      setDriverModalRecordId(null);
      setDriverPaidStr("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function extractWhereFromNote(note: string | null | undefined): string {
    const n = note ?? "";
    const idx = n.indexOf("где/за что:");
    if (idx < 0) return n.trim();
    return n.slice(idx + "где/за что:".length).trim();
  }

  async function toggleLevalsTaken(recordId: string, taken: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleTaken", recordId, taken }),
      });
      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Не удалось обновить (ошибка ${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLevalsRecord(recordId: string) {
    const ok = await showConfirm("Удалить эту запись вне магазина? Доступно только пока не отмечено «забрал».");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-extra-earnings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Не удалось удалить (ошибка ${res.status})`);
        return;
      }
      // Если мы удаляем активную запись - сбросить редактирование.
      if (levalsEditId === recordId) setLevalsEditId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
    }
  }

  function startEditLevals(r: GuideSalaryRecord) {
    setLevalsEditId(r.id);
    setLevalsTotalStr(r.outsideTotalVnd != null ? formatVndInput(r.outsideTotalVnd) : "");
    if (r.outsideDriverFixedVnd != null) {
      setLevalsDriverMode("fixed");
      setLevalsDriverFixedStr(formatVndInput(r.outsideDriverFixedVnd));
      setLevalsDriverPercentStr(String(r.outsideDriverPercent ?? 10));
    } else {
      setLevalsDriverMode("percent");
      setLevalsDriverFixedStr("");
      setLevalsDriverPercentStr(r.outsideDriverPercent != null ? String(r.outsideDriverPercent) : "10");
    }
    setLevalsWhereNote(extractWhereFromNote(r.note));
    setLevalsOpen(true);
  }

  return (
    <section
      className="mt-4 border-t border-[var(--border)] pt-4"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setCollapsed((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCollapsed((v) => !v);
        }
      }}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h2 className="text-base font-semibold">Доходы гида</h2>
          {!collapsed ? (
            <div className="mt-1 text-xs text-[var(--muted2)]">
              Официально за тур:{" "}
              <span className="font-semibold text-[var(--text)]">{formatVnd(initialOfficialAccruedVnd)}</span> · Выплачено:{" "}
              <span className="font-semibold text-[var(--text)]">{initialOfficialPaidVnd > 0 ? formatVnd(initialOfficialPaidVnd) : "-"}</span>
              {showTotal ? (
                <div className="mt-1">
                  Всего с учётом всех доплат:{" "}
                  <span className="font-semibold text-[var(--text)]">{formatVnd(initialTotalAccruedVnd)}</span> · Выплачено:{" "}
                  <span className="font-semibold text-[var(--text)]">
                    {initialTotalPaidVnd > 0 ? formatVnd(initialTotalPaidVnd) : "-"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4" hidden={collapsed}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowTotal((v) => !v)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
            disabled={busy}
          >
            {showTotal ? "Скрыть общую" : "Показать общую"}
          </button>
        </div>

        {accountantTourSalaryRecords.length > 0 ? (
          <div className="rounded-2xl border border-emerald-300/80 bg-emerald-50/90 p-3 ring-1 ring-emerald-200/80 dark:border-emerald-700/55 dark:bg-emerald-950/35 dark:ring-emerald-800/45 sm:p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200/95">
              Зарплата по туру (бухгалтерия)
            </div>
            <ul className="mt-2 space-y-2">
              {accountantTourSalaryRecords.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--muted)]">{r.note?.trim() || "Выплата зафиксирована"}</span>
                  <span className="font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">{formatVnd(r.amountVnd)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-emerald-900/85 dark:text-emerald-200/80">
              Учтено в «Официально за тур» и на странице «Моя финансовая карточка».
            </p>
          </div>
        ) : null}

        {/* Официальный магазин - отдельный блок (офис видит чек, 40% в доход гида) */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 sm:p-4">
          <div
            className="flex flex-wrap items-start justify-between gap-3 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-expanded={shopOpen}
            onClick={(e) => {
              if (isInteractiveTarget(e.target)) return;
              if (shopOpen) {
                setShopEditId(null);
                setShopProfitStr("");
                setShopWhereNote("");
                setShopReceiptFile(null);
              }
              setShopOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (shopOpen) {
                  setShopEditId(null);
                  setShopProfitStr("");
                  setShopWhereNote("");
                  setShopReceiptFile(null);
                }
                setShopOpen((v) => !v);
              }
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
                Официальный магазин · {(shopLabel || "магазин").trim() || "магазин"}
              </div>
            </div>
            <span className="text-[11px] font-medium text-[var(--muted2)]">{shopOpen ? "Свернуть" : "Открыть"}</span>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-[var(--muted2)]">
            Записей по магазину может быть несколько (разные точки или смены). Пока карточка тура не закрыта - запись можно
            исправить или удалить; после закрытия правки доступны только руководству.
          </p>

          {shopRecords.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Уже внесено</div>
              <ul className="mt-2 space-y-2">
                {shopRecords.map((r) => {
                  const parsed = parseShopExtraNote(r.note);
                  const paid = r.status === "paid";
                  const where = extractWhereFromNote(r.note);
                  const settlement = parsed.settlement ?? "guide_kept";
                  const driverPaidVnd =
                    r.shopDriverPaidByGuideVnd != null ? r.shopDriverPaidByGuideVnd : parsed.driverVnd;
                  return (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-[var(--muted2)]">
                          {r.createdAt.slice(0, 10)} · комиссия {parsed.profitVnd != null ? formatVnd(parsed.profitVnd) : "-"}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--muted)] line-clamp-2" title={where || undefined}>
                          {where || "-"}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-[var(--text)]">Гиду: {formatVnd(r.amountVnd)}</div>
                        {settlement === "guide_kept" ? (
                          <div className="mt-0.5 text-[10px] text-[var(--muted2)]">
                            Водителю: {driverPaidVnd != null ? formatVnd(driverPaidVnd) : "-"}
                          </div>
                        ) : null}
                        <div className="text-[10px] text-[var(--muted2)]">
                          {settlement === "guide_kept" ? "Деньги: забрал гид" : "Деньги: в офисе"} · {paid ? "выплата отмечена" : "на проверке"}
                        </div>
                        {r.attachmentUrl ? (
                          <a
                            href={r.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
                          >
                            Открыть чек
                          </a>
                        ) : null}
                      </div>
                      {canEditNow ? (
                        <div className="flex shrink-0 flex-col gap-1">
                          <button
                            type="button"
                            className="text-[11px] text-[var(--muted2)] underline underline-offset-2"
                            onClick={() => startEditShop(r)}
                            disabled={busy}
                          >
                            Исправить
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-red-600 dark:text-red-300 underline underline-offset-2"
                            onClick={() => void deleteShopRecord(r.id)}
                            disabled={busy}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {shopOpen ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shopEditId ? (
                <div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 sm:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Исправление записи магазина</div>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline underline-offset-2"
                    disabled={busy}
                    onClick={() => {
                      setShopEditId(null);
                      setShopProfitStr("");
                      setShopWhereNote("");
                      setShopSettlement("guide_kept");
                      setShopOfficePctStr("40");
                      setShopDriverPctStr("20");
                      setShopReceiptFile(null);
                    }}
                  >
                    Отмена
                  </button>
                </div>
              ) : null}

              <label className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Сумма от магазина (VND)</div>
                <input
                  className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                  value={shopProfitStr}
                  onChange={(e) => setShopProfitStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  placeholder="Например, 1.200.000"
                  disabled={busy || !canEditNow}
                />
              </label>

              {guideCanDefineShopSplit ? (
                <>
                  <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Офис %</div>
                      <input
                        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                        value={shopOfficePctStr}
                        onChange={(e) => setShopOfficePctStr(e.target.value.replace(/[^\d.,]/g, ""))}
                        inputMode="decimal"
                        disabled={busy || !canEditNow}
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Водитель %</div>
                      <input
                        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                        value={shopDriverPctStr}
                        onChange={(e) => setShopDriverPctStr(e.target.value.replace(/[^\d.,]/g, ""))}
                        inputMode="decimal"
                        disabled={busy || !canEditNow}
                      />
                    </label>
                  </div>
                  {shopOfficePct + shopDriverPct > 100 ? (
                    <p className="text-xs text-rose-600 sm:col-span-2">Сумма % офиса и водителя не больше 100.</p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[var(--muted)] sm:col-span-2">
                  Гид фиксирует только сумму/чек и сдает деньги в офис. Разбивку офис/гид/водитель задаёт бухгалтерия.
                </p>
              )}

              <label className="space-y-2 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Где деньги</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !canEditNow}
                    onClick={() => setShopSettlement("guide_kept")}
                    className={`rounded-xl px-3 py-2 text-[13px] font-medium ring-1 transition-colors ${shopSettlement === "guide_kept" ? "bg-[var(--accent)] text-white ring-[var(--accent)]" : "bg-[var(--surface-soft)] text-[var(--text)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"} disabled:opacity-50`}
                  >
                    Деньги забрал гид
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canEditNow}
                    onClick={() => setShopSettlement("office_received")}
                    className={`rounded-xl px-3 py-2 text-[13px] font-medium ring-1 transition-colors ${shopSettlement === "office_received" ? "bg-[var(--accent)] text-white ring-[var(--accent)]" : "bg-[var(--surface-soft)] text-[var(--text)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"} disabled:opacity-50`}
                  >
                    Деньги в офисе
                  </button>
                </div>
              </label>

              <label className="space-y-2 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
                  Уточнение (какой магазин / смена / комментарий)
                </div>
                <input
                  className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                  value={shopWhereNote}
                  onChange={(e) => setShopWhereNote(e.target.value)}
                  placeholder={`По умолчанию: «${defaultShopLabel}»`}
                  disabled={busy || !canEditNow}
                />
                {shopLabelOptions.length > 1 ? (
                  <div className="action-row mt-1">
                    <span className="text-[11px] text-[var(--muted2)]">Быстрый выбор:</span>
                    {shopLabelOptions.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setShopWhereNote(label)}
                        disabled={busy || !canEditNow}
                        className="btn-secondary !min-h-[34px] !rounded-xl !px-2.5 !py-1 !text-xs disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>

              <div className="col-span-full space-y-2 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
                  Фото чека/выплаты{shopEditId ? "" : " (обязательно)"}
                </div>
                {shopEditId ? (
                  <p className="text-[11px] text-[var(--muted2)]">
                    Оставьте поле пустым, если чек не меняется. Загрузите новое фото только при замене.
                  </p>
                ) : null}
                <input
                  id={`tour-${tourId}-shop-receipt`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  disabled={busy || !canEditNow}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setShopReceiptFile(f);
                  }}
                />
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <label
                    htmlFor={`tour-${tourId}-shop-receipt`}
                  className={`rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] ${busy || !canEditNow ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-[var(--surface-elevated)]"}`}
                  >
                    Выбрать фото
                  </label>
                  {shopReceiptFile ? (
                    <button
                      type="button"
                      className="text-[13px] text-[var(--muted)] hover:underline"
                      disabled={busy}
                      onClick={() => {
                        setShopReceiptFile(null);
                      }}
                    >
                      Убрать
                    </button>
                  ) : (
                    <div className="text-[13px] text-[var(--muted)]">файл не выбран</div>
                  )}
                </div>

                {shopReceiptPreviewUrl ? (
                  <Image
                    src={shopReceiptPreviewUrl}
                    alt=""
                    width={320}
                    height={96}
                    unoptimized
                    className="mt-2 h-24 w-full max-w-full rounded-lg object-contain ring-1 ring-[var(--border)]"
                  />
                ) : (() => {
                    const cur = shopEditId ? shopRecords.find((x) => x.id === shopEditId)?.attachmentUrl : null;
                    return cur ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cur} alt="Текущий чек" className="mt-2 h-24 w-full max-w-full rounded-lg object-contain ring-1 ring-[var(--border)]" />
                    ) : null;
                  })()}
              </div>

              <div className="col-span-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Расчёт</div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="text-[11px] text-[var(--muted2)]">Вся комиссия, VND</div>
                  <div className="font-semibold tabular-nums">{shopProfitVnd > 0 ? formatVnd(shopProfitVnd) : "-"}</div>
                  {guideCanDefineShopSplit ? (
                    <>
                      <div className="text-[11px] text-[var(--muted2)]">Начисление гиду, VND</div>
                      <div className="font-semibold tabular-nums">{shopGuideVnd > 0 ? formatVnd(shopGuideVnd) : "-"}</div>
                      <div className="text-[11px] text-[var(--muted2)]">Водитель, VND</div>
                      <div className="font-semibold tabular-nums">{shopProfitVnd > 0 ? formatVnd(shopDriverVnd) : "-"}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-[var(--muted2)]">Начисление гиду</div>
                      <div className="font-semibold tabular-nums">Определяет бухгалтерия</div>
                    </>
                  )}
                </div>
              </div>

              <div className="col-span-full flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => void submitShop()}
                  disabled={!canSaveShop || !canEditNow}
                  className="btn-primary rounded-xl px-4 py-2 disabled:opacity-50"
                >
                  {busy ? "Сохранение…" : shopEditId ? "Сохранить исправление" : "Сохранить магазин"}
                </button>
                <div className="text-[11px] text-[var(--muted2)]">
                  {!canEditNow
                    ? "Карточка тура закрыта: правки только у руководства."
                    : shopEditId
                      ? "Можно исправлять и удалять запись при ошибке."
                      : "Фото обязательно для бухгалтерии (есть доля офиса)."}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Доп. заработок вне магазина - только для гида; в закрытом виде суммы и текст не показываются */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 sm:p-4">
          <div
            className="flex flex-wrap items-start justify-between gap-3 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-expanded={levalsOpen}
            onClick={(e) => {
              if (isInteractiveTarget(e.target)) return;
              if (levalsOpen) {
                setLevalsEditId(null);
                setLevalsTotalStr("");
                setLevalsWhereNote("");
                setLevalsDriverMode("percent");
                setLevalsDriverPercentStr("10");
                setLevalsDriverFixedStr("");
              }
              setLevalsOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (levalsOpen) {
                  setLevalsEditId(null);
                  setLevalsTotalStr("");
                  setLevalsWhereNote("");
                  setLevalsDriverMode("percent");
                  setLevalsDriverPercentStr("10");
                  setLevalsDriverFixedStr("");
                }
                setLevalsOpen((v) => !v);
              }
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Доп. заработок гида</div>
              {levalsOpen || !hasPrivateExtra ? (
                <p className="mt-1.5 break-words text-sm text-[var(--muted)]">
                  Доплаты вне магазина - пишите что хотите или не пишите вовсе: это только для вас, офис эти суммы и подписи никогда
                  не увидит.
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-[var(--muted)]">
                  Личный блок скрыт: суммы и заметки не отображаются, пока вы его не откроете.
                </p>
              )}
            </div>
            <span className="text-[11px] font-medium text-[var(--muted2)]">{levalsOpen ? "Свернуть" : "Открыть"}</span>
          </div>

          {levalsOpen ? (
            <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">История вне магазина</div>
                {levalsRecords.length > 0 ? (
                  <div className="text-[11px] text-[var(--muted2)]">{levalsRecords.length} записей</div>
                ) : null}
              </div>

              {levalsRecords.length === 0 ? (
                <div className="mt-1 text-[13px] text-[var(--muted)]">Пока нет</div>
              ) : (
                <ul className="max-h-44 space-y-2 overflow-auto pr-1">
                  {levalsRecords.map((r) => {
                    const taken = r.status === "paid";
                    const where = extractWhereFromNote(r.note);
                    return (
                      <li key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={taken}
                                onChange={(e) => void toggleLevalsTaken(r.id, e.target.checked)}
                                disabled={busy}
                              />
                              <span className="text-[11px] text-[var(--muted2)]">{taken ? "Забрал" : "Не забрал"}</span>
                            </div>
                            <div className="mt-1 text-[12px] text-[var(--muted)] line-clamp-2" title={where || undefined}>
                              {where || "-"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold tabular-nums text-[var(--text)]">{formatVnd(r.amountVnd)}</div>
                            {!taken ? (
                              <div className="mt-2 flex flex-col gap-1">
                                <button
                                  type="button"
                                  className="text-xs text-[var(--muted2)] underline underline-offset-2"
                                  onClick={() => startEditLevals(r)}
                                  disabled={busy}
                                >
                                  Редактировать
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-red-600 dark:text-red-300 underline underline-offset-2 disabled:opacity-50"
                                  onClick={() => void deleteLevalsRecord(r.id)}
                                  disabled={busy}
                                >
                                  Удалить
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {levalsOpen ? (
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4">
              {levalsEditId ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Редактирование записи</div>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] underline underline-offset-2"
                    disabled={busy}
                    onClick={() => {
                      setLevalsEditId(null);
                      setLevalsTotalStr("");
                      setLevalsWhereNote("");
                      setLevalsDriverMode("percent");
                      setLevalsDriverPercentStr("10");
                      setLevalsDriverFixedStr("");
                    }}
                  >
                    Отмена
                  </button>
                </div>
              ) : null}

              <label className="block min-w-0 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Сумма вне магазина, VND</div>
                <input
                  className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                  value={levalsTotalStr}
                  onChange={(e) => setLevalsTotalStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  placeholder="Например, 800.000"
                  disabled={busy}
                />
              </label>

              <div className="min-w-0 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Водитель получает</div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setLevalsDriverMode("percent")}
                    className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                  >
                    Проценты
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setLevalsDriverMode("fixed")}
                    className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                  >
                    Фикс сумма
                  </button>
                </div>

                {levalsDriverMode === "percent" ? (
                  <>
                    <div className="text-[11px] text-[var(--muted2)]">Доля водителя, % (если 0 - гид забирает всё)</div>
                    <input
                      className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                      value={levalsDriverPercentStr}
                      onChange={(e) => setLevalsDriverPercentStr(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      disabled={busy}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverPercentStr("10")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        Стандарт (10%)
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverPercentStr("20")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        Кофе (20%)
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverPercentStr("30")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        30%
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverPercentStr("50")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        Пополам
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverPercentStr("0")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        Водителю 0
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] text-[var(--muted2)]">Фиксированная сумма водителю, VND</div>
                    <input
                      className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                      value={levalsDriverFixedStr}
                      onChange={(e) => setLevalsDriverFixedStr(formatVndInput(parseVndInput(e.target.value)))}
                      inputMode="numeric"
                      placeholder="Например, 100.000"
                      disabled={busy}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || levalsTotalVnd < 1}
                        onClick={() => {
                          const v = Math.round((levalsTotalVnd * 10) / 100);
                          setLevalsDriverFixedStr(formatVndInput(v));
                        }}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                      >
                        Стандарт (10%)
                      </button>
                      <button
                        type="button"
                        disabled={busy || levalsTotalVnd < 1}
                        onClick={() => {
                          const v = Math.round((levalsTotalVnd * 20) / 100);
                          setLevalsDriverFixedStr(formatVndInput(v));
                        }}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                      >
                        Кофе (20%)
                      </button>
                      <button
                        type="button"
                        disabled={busy || levalsTotalVnd < 1}
                        onClick={() => {
                          const v = Math.round((levalsTotalVnd * 30) / 100);
                          setLevalsDriverFixedStr(formatVndInput(v));
                        }}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                      >
                        30%
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setLevalsDriverFixedStr("")}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[13px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      >
                        Водителю 0
                      </button>
                    </div>
                  </>
                )}
              </div>

              <label className="block min-w-0 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Где/за что заработал</div>
                <input
                  className="field-surface w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                  value={levalsWhereNote}
                  onChange={(e) => setLevalsWhereNote(e.target.value)}
                  placeholder="Например: дополнительная помощь 20:00 / чаевые"
                  disabled={busy}
                />
              </label>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Расчёт</div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="text-[11px] text-[var(--muted2)]">Начисление гиду, VND</div>
                  <div className="font-semibold tabular-nums">{levalsGuideVnd > 0 ? formatVnd(levalsGuideVnd) : "-"}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void submitLevals()}
                  disabled={!canSaveLevals}
                  className="btn-primary rounded-xl px-4 py-2 disabled:opacity-50"
                >
                  {busy ? "Сохранение…" : levalsEditId ? "Сохранить правку" : "Сохранить вне магазина"}
                </button>
                <div className="text-[11px] text-[var(--muted2)]">Без доли офиса - фото не нужно.</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {driverModalRecordId ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card w-full max-w-sm shadow-lg">
            <p className="text-sm font-medium text-[var(--text)]">Водителю, ₫</p>
            <input
              className="field-surface mt-2 w-full rounded-xl px-3 py-2 text-sm tabular-nums"
              value={driverPaidStr}
              onChange={(e) => setDriverPaidStr(formatVndInput(parseVndInput(e.target.value)))}
              inputMode="numeric"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]"
                onClick={() => {
                  setDriverModalRecordId(null);
                  setDriverPaidStr("");
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void submitDriverPaidModal()}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
