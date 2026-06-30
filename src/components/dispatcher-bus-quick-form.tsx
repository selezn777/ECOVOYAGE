"use client";

import { useEffect, useMemo, useState } from "react";
import { formatVndInput } from "@/lib/format";
import { canAssignTourBuses } from "@/lib/role-policy";
import type { Role, TourBusAssignment } from "@/lib/types";
import { showConfirm } from "@/lib/ui-dialog";

// ─── Phone utils ───────────────────────────────────────────────────────────
function digitsOnly(s: string) { return String(s || "").replace(/[^\d]/g, ""); }
function toVnLocalDigits(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  if (d.startsWith("84")) return d.slice(2);
  if (d.startsWith("0")) return d.slice(1);
  return d;
}
function formatLocalPretty(local: string): string {
  if (!local) return "";
  if (local.length <= 3) return local;
  if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
function toE164(localDigits: string): string {
  const d = digitsOnly(localDigits);
  if (!d) return "";
  return `+84${d}`;
}
function phoneToZaloPath(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `84${digits.slice(1)}`;
  if (digits.startsWith("84")) return digits;
  return digits;
}

// ─── Time options ───────────────────────────────────────────────────────────
const MEETING_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MEETING_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const SEAT_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

function snapMeetingMinute(m: string): string {
  if (MEETING_MINUTES.includes(m)) return m;
  const n = parseInt(m, 10);
  if (!Number.isFinite(n) || n < 0 || n > 59) return "";
  const snapped = Math.round(n / 5) * 5;
  const s = String(Math.min(55, snapped)).padStart(2, "0");
  return MEETING_MINUTES.includes(s) ? s : "";
}

// ─── Comment parse/build ────────────────────────────────────────────────────
function parseCommentIntoForm(comment: string | null) {
  const raw = String(comment || "").trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let driverName = "", driverPhoneLocal = "", meetingHour = "", meetingMinute = "", meetingPlace = "";
  const noteLines: string[] = [];
  for (const line of lines) {
    if (/^водитель:\s*/i.test(line)) { driverName = line.replace(/^водитель:\s*/i, "").trim(); continue; }
    if (/^тел:\s*/i.test(line)) {
      const tel = line.replace(/^тел:\s*/i, "").trim();
      driverPhoneLocal = formatLocalPretty(toVnLocalDigits(tel));
      continue;
    }
    if (/^встреча:\s*/i.test(line)) {
      const rest = line.replace(/^встреча:\s*/i, "").trim();
      const dotIdx = rest.indexOf("·");
      const timePart = (dotIdx >= 0 ? rest.slice(0, dotIdx) : rest).trim();
      meetingPlace = dotIdx >= 0 ? rest.slice(dotIdx + 1).trim() : "";
      const tm = /^[-–]\s*$/.test(timePart) ? "" : timePart;
      const m = /^(\d{1,2}):(\d{2})$/.exec(tm);
      if (m) {
        meetingHour = m[1].padStart(2, "0");
        meetingMinute = snapMeetingMinute(m[2].padStart(2, "0"));
        if (!meetingMinute) meetingHour = "";
      }
      continue;
    }
    noteLines.push(line);
  }
  return { driverName, driverPhoneLocal, meetingHour, meetingMinute, meetingPlace, note: noteLines.join("\n") };
}

function buildCombinedComment(fields: {
  driverName: string; driverPhoneLocal: string;
  meetingHour: string; meetingMinute: string; meetingPlace: string; note: string;
}): string | null {
  const parts: string[] = [];
  const n = fields.driverName.trim();
  const localDigits = toVnLocalDigits(fields.driverPhoneLocal);
  const p = localDigits ? `+84${localDigits}` : "";
  const mt = (fields.meetingHour && fields.meetingMinute) ? `${fields.meetingHour}:${fields.meetingMinute}` : "";
  const mp = fields.meetingPlace.trim();
  const extra = fields.note.trim();
  if (n) parts.push(`Водитель: ${n}`);
  if (p) parts.push(`Тел: ${p}`);
  if (mt || mp) parts.push(`Встреча: ${mt || "-"}${mp ? ` · ${mp}` : ""}`);
  if (extra) parts.push(extra);
  return parts.join("\n") || null;
}

// ─── Driver templates (localStorage) ───────────────────────────────────────
const TEMPLATES_KEY = "dispatcher_driver_templates_v1";

type DriverTemplate = {
  id: string;
  name: string;
  phone: string;
  busNumber: string;
  seats: string;
};

function loadTemplates(): DriverTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]") as DriverTemplate[];
  } catch { return []; }
}

function saveTemplates(list: DriverTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, 20)));
}

// ─── Zalo copy message ──────────────────────────────────────────────────────
function ZaloDriverButton({ tourId, driverPhone }: { tourId: string; driverPhone: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const zaloHref = `https://zalo.me/${phoneToZaloPath(driverPhone)}`;

  async function copyMessage() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/driver-message`);
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || "Ошибка");
      await navigator.clipboard.writeText((j as { text: string }).text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copyMessage()}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-colors disabled:opacity-50 ${
          copied
            ? "bg-emerald-600 text-white ring-emerald-500/60"
            : "bg-[var(--surface-soft)] text-[var(--text)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
        }`}
      >
        {copied ? "✓ Скопировано" : busy ? "…" : "Скопировать инфо для Zalo"}
      </button>
      <a
        href={zaloHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white ring-1 ring-sky-500/60 hover:bg-sky-500"
      >
        Zalo водителю
      </a>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export function DispatcherBusQuickForm({
  tourId,
  viewerRole,
  buses,
}: {
  tourId: string;
  viewerRole: Role;
  buses: TourBusAssignment[];
}) {
  const allowed = canAssignTourBuses(viewerRole);
  const hasBus = buses.length > 0;
  const [open, setOpen] = useState(!hasBus);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [busNumber, setBusNumber] = useState("");
  const [seatsSelect, setSeatsSelect] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhoneLocal, setDriverPhoneLocal] = useState("");
  const [meetingHour, setMeetingHour] = useState("");
  const [meetingMinute, setMeetingMinute] = useState("");
  const [meetingPlace, setMeetingPlace] = useState("");
  const [note, setNote] = useState("");
  const [driverPaidStr, setDriverPaidStr] = useState("");

  // Templates
  const [templates, setTemplates] = useState<DriverTemplate[]>([]);
  useEffect(() => { setTemplates(loadTemplates()); }, []);

  const isEdit = Boolean(editingId);
  const seats = useMemo(() => {
    if (!seatsSelect) return null;
    const n = Number(seatsSelect);
    return Number.isFinite(n) && n >= 1 && n <= 50 ? n : null;
  }, [seatsSelect]);

  const driverPaidVnd = useMemo(() => {
    const raw = digitsOnly(driverPaidStr);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [driverPaidStr]);

  const canSave = allowed && !busy && busNumber.trim().length >= 1 && seats != null && (isEdit || driverPaidVnd != null);

  function clearForm() {
    setBusNumber(""); setSeatsSelect(""); setDriverName(""); setDriverPhoneLocal("");
    setMeetingHour(""); setMeetingMinute(""); setMeetingPlace(""); setNote(""); setDriverPaidStr("");
  }

  function fillFromTemplate(t: DriverTemplate) {
    setDriverName(t.name);
    setDriverPhoneLocal(t.phone);
    if (t.busNumber) setBusNumber(t.busNumber);
    if (t.seats) setSeatsSelect(t.seats);
  }

  function saveTemplate() {
    if (!driverName.trim()) return;
    const tmpl: DriverTemplate = {
      id: Date.now().toString(),
      name: driverName.trim(),
      phone: driverPhoneLocal,
      busNumber: busNumber.trim(),
      seats: seatsSelect,
    };
    const updated = [tmpl, ...templates.filter((t) => t.name !== tmpl.name)].slice(0, 20);
    saveTemplates(updated);
    setTemplates(updated);
    alert(`Шаблон "${tmpl.name}" сохранён`);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    saveTemplates(updated);
    setTemplates(updated);
  }

  function startEdit(b: TourBusAssignment) {
    if (!b.id) return;
    setEditingId(b.id);
    setBusNumber(b.busNumber);
    setSeatsSelect(b.seats != null && b.seats >= 1 && b.seats <= 50 ? String(b.seats) : "");
    const p = parseCommentIntoForm(b.comment);
    setDriverName(p.driverName); setDriverPhoneLocal(p.driverPhoneLocal);
    setMeetingHour(p.meetingHour); setMeetingMinute(p.meetingMinute);
    setMeetingPlace(p.meetingPlace); setNote(p.note);
    setDriverPaidStr("");
    setOpen(true);
  }

  async function removeAssignment(assignmentId: string) {
    const ok = await showConfirm("Удалить назначение автобуса?\n\nСтрока расхода «оплата водителю» не удалится автоматически.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/buses/${assignmentId}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const comment = buildCombinedComment({ driverName, driverPhoneLocal, meetingHour, meetingMinute, meetingPlace, note });
      if (isEdit && editingId) {
        const res = await fetch(`/api/tours/${tourId}/buses/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ busNumber: busNumber.trim(), seats, comment, langNoteEn: null, langNoteVn: null }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string | object };
        if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      } else {
        const res = await fetch(`/api/tours/${tourId}/buses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ busNumber: busNumber.trim(), seats, comment, langNoteEn: null, langNoteVn: null, driverPaidVnd }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string | object };
        if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      }
      setOpen(false);
      setEditingId(null);
      clearForm();
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;

  // Extract driver phone for Zalo from any assigned bus
  const firstBusPhone = buses.map((b) => {
    const m = String(b.comment || "").match(/^тел:\s*(.+)$/im);
    if (!m) return null;
    const raw = m[1].trim();
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return null;
    return raw.includes("+") ? `+${digits}` : digits.startsWith("0") ? `+84${digits.slice(1)}` : digits.startsWith("84") ? `+${digits}` : `+84${digits}`;
  }).find(Boolean);

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`text-xs font-semibold uppercase tracking-wide ${
          hasBus ? "text-[var(--text)]" : "rounded-md bg-amber-100 px-2 py-1 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/30"
        }`}>
          {hasBus ? `Автобусов: ${buses.length}` : "Автобус не назначен"}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (open) { setOpen(false); setEditingId(null); clearForm(); }
            else { setEditingId(null); clearForm(); setOpen(true); }
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 disabled:opacity-50 ${
            !open && hasBus
              ? "bg-emerald-600 text-white ring-emerald-500/70 hover:bg-emerald-500"
              : "bg-[var(--surface)] text-[var(--text)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          {open ? "Свернуть" : hasBus ? "Добавить автобус" : "Назначить"}
        </button>
      </div>

      {/* Assigned buses list */}
      {buses.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {buses.map((b, idx) => {
            const parsed = parseCommentIntoForm(b.comment);
            const phone = parsed.driverPhoneLocal ? toE164(parsed.driverPhoneLocal) : null;
            return (
              <li
                key={b.id ?? `${b.busNumber}-${idx}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                {/* Bus number + seats */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold tabular-nums text-[var(--text)]">{b.busNumber}</span>
                    {b.seats != null ? (
                      <span className="text-xs text-[var(--muted)]">{b.seats} мест</span>
                    ) : null}
                  </div>
                  {b.id ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(b)}
                        className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { if (b.id) void removeAssignment(b.id); }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:text-red-300 disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Driver info */}
                {(parsed.driverName || parsed.driverPhoneLocal || parsed.meetingHour || parsed.meetingPlace) ? (
                  <div className="mt-2 space-y-0.5 text-xs text-[var(--muted)]">
                    {parsed.driverName ? (
                      <div><span className="font-semibold text-[var(--text)]">{parsed.driverName}</span></div>
                    ) : null}
                    {phone ? (
                      <div>
                        <a href={`tel:${phone}`} className="text-[var(--accent)] underline-offset-2 hover:underline">
                          {phone}
                        </a>
                      </div>
                    ) : null}
                    {(parsed.meetingHour && parsed.meetingMinute) || parsed.meetingPlace ? (
                      <div>
                        Встреча: {parsed.meetingHour && parsed.meetingMinute ? `${parsed.meetingHour}:${parsed.meetingMinute}` : ""}
                        {parsed.meetingPlace ? ` · ${parsed.meetingPlace}` : ""}
                      </div>
                    ) : null}
                    {parsed.note ? <div className="text-[var(--muted2)]">{parsed.note}</div> : null}
                  </div>
                ) : null}

                {/* Zalo buttons */}
                {phone ? (
                  <div className="mt-2">
                    <ZaloDriverButton tourId={tourId} driverPhone={phone} />
                  </div>
                ) : null}

                {b.assignedByName ? (
                  <p className="mt-2 text-[10px] text-[var(--muted2)]">Внёс: {b.assignedByName}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Also show Zalo for first bus if no parsed phone from comment */}
      {hasBus && firstBusPhone && !buses.some((b) => parseCommentIntoForm(b.comment).driverPhoneLocal) ? (
        <div className="mt-2">
          <ZaloDriverButton tourId={tourId} driverPhone={firstBusPhone} />
        </div>
      ) : null}

      {/* Form */}
      {open ? (
        <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          {isEdit ? (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-[12px] text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              Редактирование — оплата водителю уже записана в расходы и не меняется.
            </p>
          ) : hasBus ? (
            <p className="text-[11px] text-[var(--muted)]">Добавляется ещё один автобус к туру.</p>
          ) : null}

          {/* Driver templates */}
          {templates.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Шаблоны водителей</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fillFromTemplate(t)}
                      className="rounded-lg bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(t.id)}
                      className="rounded px-1 text-[11px] text-[var(--muted2)] hover:text-red-500"
                      title="Удалить шаблон"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Bus number + seats */}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={busNumber}
              onChange={(e) => setBusNumber(e.target.value)}
              placeholder="Номер автобуса (79H-08857)"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              disabled={busy}
            />
            <select
              value={seatsSelect}
              onChange={(e) => setSeatsSelect(e.target.value)}
              disabled={busy}
              className="field-surface w-24 cursor-pointer rounded-xl px-2 py-2 text-sm tabular-nums"
              aria-label="Мест в автобусе"
            >
              <option value="">Мест</option>
              {SEAT_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </div>

          {/* Driver name + phone */}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Имя водителя"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              disabled={busy}
            />
            <div className="field-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
              <span className="shrink-0 font-semibold text-[var(--text)]">+84</span>
              <span className="h-4 w-px shrink-0 bg-[var(--border)]" />
              <input
                value={driverPhoneLocal}
                onChange={(e) => {
                  const local = toVnLocalDigits(e.target.value).slice(0, 10);
                  setDriverPhoneLocal(formatLocalPretty(local));
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const local = toVnLocalDigits(text).slice(0, 10);
                  if (local) { e.preventDefault(); setDriverPhoneLocal(formatLocalPretty(local)); }
                }}
                placeholder="383 714 638"
                inputMode="tel"
                className="w-full bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--muted2)]"
                disabled={busy}
              />
            </div>
          </div>

          {/* Meeting time + place */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-medium text-[var(--muted2)]">Время встречи с водителем</p>
              <div className="field-surface flex items-stretch gap-1.5 rounded-xl px-2 py-1.5" role="group">
                <select
                  value={meetingHour}
                  onChange={(e) => { setMeetingHour(e.target.value); if (!e.target.value) setMeetingMinute(""); }}
                  disabled={busy}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent py-1 text-sm tabular-nums outline-none"
                >
                  <option value="">Час</option>
                  {MEETING_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="flex items-center text-[var(--muted2)]">:</span>
                <select
                  value={meetingMinute}
                  onChange={(e) => setMeetingMinute(e.target.value)}
                  disabled={busy || !meetingHour}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent py-1 text-sm tabular-nums outline-none disabled:opacity-50"
                >
                  <option value="">Мин</option>
                  {MEETING_MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <input
              value={meetingPlace}
              onChange={(e) => setMeetingPlace(e.target.value)}
              placeholder="Место встречи"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              disabled={busy}
            />
          </div>

          {/* Note */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий (необязательно)"
            className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            disabled={busy}
          />

          {/* Driver pay (only on create) */}
          {!isEdit ? (
            <div className="field-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
              <input
                value={driverPaidStr}
                onChange={(e) => setDriverPaidStr(formatVndInput(Number(digitsOnly(e.target.value) || 0)) || "")}
                placeholder="Оплата водителю (обязательно)"
                inputMode="numeric"
                className="min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--muted2)]"
                disabled={busy}
              />
              <span className="shrink-0 text-base font-semibold text-[var(--muted2)]">₫</span>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void save()}
              className="btn-primary flex-1 rounded-xl px-4 py-2 disabled:opacity-50"
            >
              {busy ? "Сохранение…" : isEdit ? "Сохранить изменения" : "Сохранить"}
            </button>
            {driverName.trim() ? (
              <button
                type="button"
                onClick={saveTemplate}
                className="rounded-xl px-3 py-2 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                title="Сохранить водителя как шаблон для быстрого выбора"
              >
                Шаблон ↓
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
