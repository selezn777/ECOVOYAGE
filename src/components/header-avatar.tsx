"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { isUuidSessionUser } from "@/lib/actor-id";
import type { SessionUser } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { showConfirm } from "@/lib/ui-dialog";

const CROP_OUT = 640; // финальный размер аватара px

// ─── Crop state (не в React state — обновляется напрямую для плавного drag) ──
type Crop = {
  img: HTMLImageElement;
  objectUrl: string;
  natW: number;
  natH: number;
  zoom: number; // 1.0 = cover (минимум), >1 = zoom in
  panX: number; // смещение по X в экранных px, + = сдвиг картинки вправо
  panY: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function cropViewSize(): number {
  if (typeof window === "undefined") return 260;
  return Math.min(260, Math.floor(window.innerWidth * 0.82));
}

/** Минимальный масштаб чтобы картинка покрывала весь круг (object-fit: cover). */
function coverScale(natW: number, natH: number, vs: number): number {
  return Math.max(vs / Math.max(1, natW), vs / Math.max(1, natH));
}

/** Прямоугольник источника для drawImage при заданных pan/zoom. */
function srcRect(c: Crop, vs: number) {
  const cs = coverScale(c.natW, c.natH, vs);
  const ts = cs * c.zoom; // полный масштаб (src-px → экран-px)
  const sw = vs / ts;
  const sh = vs / ts;
  const cx = c.natW / 2 - c.panX / ts;
  const cy = c.natH / 2 - c.panY / ts;
  return {
    sx: clamp(cx - sw / 2, 0, Math.max(0, c.natW - sw)),
    sy: clamp(cy - sh / 2, 0, Math.max(0, c.natH - sh)),
    sw,
    sh,
    ts,
  };
}

/** Максимально допустимый pan чтобы изображение всегда покрывало круг. */
function panLimits(c: Crop, vs: number) {
  const { sw, sh, ts } = srcRect(c, vs);
  return {
    maxX: Math.max(0, (c.natW - sw) / 2 * ts),
    maxY: Math.max(0, (c.natH - sh) / 2 * ts),
  };
}

async function loadCrop(file: File): Promise<Crop> {
  const objectUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("Не удалось открыть изображение"));
    el.src = objectUrl;
  });
  return {
    img,
    objectUrl,
    natW: img.naturalWidth || img.width,
    natH: img.naturalHeight || img.height,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

async function buildOutputFile(c: Crop, vs: number): Promise<File> {
  const { sx, sy, sw, sh } = srcRect(c, vs);
  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUT;
  canvas.height = CROP_OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas не поддерживается");
  ctx.drawImage(c.img, sx, sy, sw, sh, 0, 0, CROP_OUT, CROP_OUT);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Ошибка canvas"))), "image/jpeg", 0.92),
  );
  return new File([blob], "avatar-cropped.jpg", { type: "image/jpeg" });
}

function formatPatchError(json: unknown): string {
  if (!json || typeof json !== "object") return "Не удалось сохранить фото";
  const j = json as Record<string, unknown>;
  if (typeof j.error === "string") return j.error;
  if (j.error && typeof j.error === "object") {
    const fe = (j.error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fe) { const r = Object.values(fe).flat()[0]; if (r) return r; }
    const fm = (j.error as { formErrors?: string[] }).formErrors;
    if (fm?.[0]) return String(fm[0]);
  }
  return "Не удалось сохранить фото";
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function HeaderAvatar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const canEdit = isUuidSessionUser(user.id);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [lightbox, setLightbox] = useState(false);
  const [hasCrop, setHasCrop] = useState(false);   // есть ли активный кроп
  const [zoomUi, setZoomUi] = useState(1);          // для слайдера (только UI)
  const [busy, setBusy] = useState(false);
  const [viewSize, setViewSize] = useState(260);

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<Crop | null>(null);        // живое состояние кропа
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setAvatarUrl(user.avatarUrl ?? null); }, [user.avatarUrl]);
  useEffect(() => { setViewSize(cropViewSize()); }, []);

  // ─── Рисуем canvas ────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const c = cropRef.current;
    const canvas = canvasRef.current;
    if (!c || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vs = canvas.width; // используем реальный размер canvas
    const { sx, sy, sw, sh } = srcRect(c, vs);
    ctx.clearRect(0, 0, vs, vs);
    ctx.drawImage(c.img, sx, sy, sw, sh, 0, 0, vs, vs);
  }, []);

  // Перерисовываем когда viewSize меняется или появляется новый crop
  useEffect(() => { if (hasCrop) drawCanvas(); }, [hasCrop, viewSize, drawCanvas]);

  // ─── Pointer handlers (drag) ───────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !cropRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const c = cropRef.current;
    const vs = canvasRef.current?.width ?? viewSize;
    const lim = panLimits(c, vs);
    cropRef.current = {
      ...c,
      panX: clamp(c.panX + dx, -lim.maxX, lim.maxX),
      panY: clamp(c.panY + dy, -lim.maxY, lim.maxY),
    };
    drawCanvas();
  }, [viewSize, drawCanvas]);

  const onPointerEnd = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  }, []);

  // ─── Zoom slider ──────────────────────────────────────────────────────────
  const onZoomChange = useCallback((nextZoom: number) => {
    if (!cropRef.current) return;
    const c = { ...cropRef.current, zoom: nextZoom };
    const vs = canvasRef.current?.width ?? viewSize;
    const lim = panLimits(c, vs);
    c.panX = clamp(c.panX, -lim.maxX, lim.maxX);
    c.panY = clamp(c.panY, -lim.maxY, lim.maxY);
    cropRef.current = c;
    setZoomUi(nextZoom);
    drawCanvas();
  }, [viewSize, drawCanvas]);

  // ─── Загрузка файла ───────────────────────────────────────────────────────
  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f || !canEdit) return;
    try {
      const crop = await loadCrop(f);
      if (cropRef.current) URL.revokeObjectURL(cropRef.current.objectUrl);
      cropRef.current = crop;
      setZoomUi(1);
      setHasCrop(true);
      setLightbox(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  }

  // ─── Сохранение ──────────────────────────────────────────────────────────
  async function uploadCropped() {
    if (!cropRef.current || !canEdit) return;
    setBusy(true);
    try {
      const vs = canvasRef.current?.width ?? viewSize;
      const file = await buildOutputFile(cropRef.current, vs);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "avatar");
      const up = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await up.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!up.ok) throw new Error(j.error || "Загрузка не удалась");
      if (!j.url) throw new Error("Нет URL файла");
      // Сохраняем URL в профиле
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ avatarUrl: j.url.trim() }),
      });
      const pj = (await res.json().catch(() => ({}))) as { error?: unknown; avatarUrl?: string | null };
      if (!res.ok) throw new Error(formatPatchError(pj));
      setAvatarUrl(pj.avatarUrl ?? j.url.trim());
      router.refresh();
      URL.revokeObjectURL(cropRef.current.objectUrl);
      cropRef.current = null;
      setHasCrop(false);
      setLightbox(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function clearAvatar() {
    const ok = await showConfirm("Убрать фото профиля?");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ avatarUrl: "" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(formatPatchError(j));
      }
      setAvatarUrl(null);
      router.refresh();
      setLightbox(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function closeLightbox() {
    if (busy) return;
    setLightbox(false);
    if (cropRef.current && !avatarUrl) {
      // Если была загружена но не сохранена — чистим
    }
    setHasCrop(false);
  }

  function onAvatarClick() {
    if (avatarUrl) setLightbox(true);
    else if (canEdit) fileRef.current?.click();
  }

  return (
    <>
      {/* opacity:0 вместо display:none — iOS PWA блокирует .click() на display:none инпутах */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: "1px", height: "1px" }}
        onChange={(e) => void onFile(e)}
      />

      <button
        type="button"
        onClick={onAvatarClick}
        disabled={busy}
        className="shrink-0 rounded-full ring-2 ring-[var(--border)] transition-[box-shadow,opacity] hover:ring-[var(--accent)] disabled:opacity-60"
        aria-label={avatarUrl ? "Открыть фото профиля" : "Добавить фото профиля"}
      >
        <UserAvatar fullName={user.fullName} url={avatarUrl} size={52} />
      </button>

      {lightbox ? createPortal(
        <div
          className="ui-scrim fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Фото профиля"
          onClick={() => closeLightbox()}
        >
          <div
            className="w-full max-w-[min(92vw,420px)] overflow-hidden rounded-2xl bg-[var(--surface)] shadow-2xl ring-1 ring-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            {hasCrop ? (
              <div className="p-4">
                <p className="mb-3 text-sm font-semibold text-[var(--text)]">Выберите область аватара</p>

                {/* Canvas-превью — рисуем drawImage напрямую, никаких CSS-трансформов */}
                <div className="flex justify-center">
                  <canvas
                    ref={canvasRef}
                    width={viewSize}
                    height={viewSize}
                    className="rounded-full ring-2 ring-[var(--accent)]"
                    style={{ touchAction: "none", cursor: "grab", display: "block" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                  />
                </div>

                <label className="mt-4 block text-xs text-[var(--muted)]">
                  Масштаб
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.01}
                    value={zoomUi}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <p className="mt-1 text-[11px] text-[var(--muted2)]">Потяните фото пальцем, настройте масштаб.</p>
              </div>
            ) : avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL из хранилища
              <img
                src={avatarUrl}
                alt=""
                className="max-h-[min(70vh,520px)] w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--surface-soft)] p-3">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (hasCrop) {
                        void uploadCropped();
                      } else {
                        setLightbox(false);
                        window.setTimeout(() => fileRef.current?.click(), 50);
                      }
                    }}
                    className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Сохранение…" : hasCrop ? "Сохранить аватар" : "Заменить фото"}
                  </button>
                  {avatarUrl && !hasCrop ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void clearAvatar()}
                      className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                    >
                      Убрать
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={() => closeLightbox()}
                className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
