"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PushNotificationsControl } from "@/components/push-notifications-control";
import {
  canSendStaffAnnouncement,
  DIRECTOR_ANNOUNCEMENT_TARGET_ROLES,
} from "@/lib/staff-announcements-policy";
import { roleLabel } from "@/lib/role-labels";
import type { Role, SessionUser } from "@/lib/types";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkUrl: string | null;
  meta: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

// kindLabelRu and audienceHintRu are replaced by t() calls inside the component

export function StaffNotificationsModalTrigger({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<NotificationRow | null>(null);
  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [directorAll, setDirectorAll] = useState(false);
  const [directorRoles, setDirectorRoles] = useState<Record<string, boolean>>({});

  const t = useTranslations("notifications");
  const showComposer = canSendStaffAnnouncement(user.baseRole);

  function kindLabel(kind: string): string {
    switch (kind) {
      case "announcement": return t("kindAnnouncement");
      case "guide_assigned": return t("kindGuideAssigned");
      case "manager_point_assigned": return t("kindPointAssigned");
      case "tour_created_dispatcher": return t("kindTourCreated");
      case "ticket_sale_vinwonders_dispatcher": return t("kindTicketSale");
      default: return t("kindDefault");
    }
  }

  function audienceHint(baseRole: Role): string {
    switch (baseRole) {
      case "chief_manager": return t("audienceManagers");
      case "chief_guide": return t("audienceGuides");
      case "dispatcher": return t("audienceDispatchers");
      default: return "";
    }
  }

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=60");
      const j = (await res.json()) as {
        items?: NotificationRow[];
        unreadCount?: number;
        migrationNeeded?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || t("loadError"));
      setItems(j.items ?? []);
      setUnreadCount(typeof j.unreadCount === "number" ? j.unreadCount : 0);
      setMigrationNeeded(Boolean(j.migrationNeeded));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !detail) return;
    if (detail.readAt) return;
    void fetch(`/api/notifications/${detail.id}/read`, { method: "PATCH" }).then(() => {
      setDetail((d) => (d && d.id === detail.id ? { ...d, readAt: new Date().toISOString() } : d));
      setItems((prev) =>
        prev.map((r) => (r.id === detail.id ? { ...r, readAt: new Date().toISOString() } : r)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });
  }, [open, detail]);

  const badge = useMemo(() => {
    if (unreadCount < 1) return null;
    const n = unreadCount > 99 ? "99+" : String(unreadCount);
    return (
      <span className="ml-1 inline-flex min-w-[1.25rem] justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
        {n}
      </span>
    );
  }, [unreadCount]);

  async function submitAnnouncement() {
    setComposeError(null);
    const body = composeBody.trim();
    if (!body) return;
    if (user.baseRole === "director" && !directorAll) {
      const anyRole = DIRECTOR_ANNOUNCEMENT_TARGET_ROLES.some((r) => directorRoles[r]);
      if (!anyRole) {
        alert(t("selectRecipients"));
        return;
      }
    }
    setComposeBusy(true);
    try {
      let payload: Record<string, unknown>;
      if (user.baseRole === "director") {
        const roles = DIRECTOR_ANNOUNCEMENT_TARGET_ROLES.filter((r) => directorRoles[r]);
        payload = {
          title: composeTitle.trim() || undefined,
          body,
          audience: directorAll ? "all" : "custom",
          ...(directorAll ? {} : { roles }),
        };
      } else {
        payload = { title: composeTitle.trim() || undefined, body };
      }
      const res = await fetch("/api/staff-announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || t("sendError"));
      setComposeTitle("");
      setComposeBody("");
      setTab("inbox");
      await load();
      router.refresh();
      alert(t("sentSuccess"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("sendError");
      setComposeError(msg);
      alert(msg);
    } finally {
      setComposeBusy(false);
    }
  }

  const overlay =
    open && mounted ? (
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
        role="presentation"
        onMouseDown={(ev) => {
          if (ev.target === ev.currentTarget) setOpen(false);
        }}
      >
        <div
          className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
          role="dialog"
          aria-modal
          aria-labelledby="staff-notifications-title"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 id="staff-notifications-title" className="text-base font-semibold text-[var(--text)]">
              {t("title")}
            </h2>
            <button
              type="button"
              className="btn-secondary min-h-[36px] rounded-xl px-3 text-sm"
              onClick={() => setOpen(false)}
            >
              {t("closeBtn")}
            </button>
          </div>

          {showComposer ? (
            <div className="flex shrink-0 gap-1 border-b border-[var(--border)] px-2 py-2">
              <button
                type="button"
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
                  tab === "inbox"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-soft)] text-[var(--text)]"
                }`}
                onClick={() => setTab("inbox")}
              >
                {t("inbox")}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
                  tab === "compose"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-soft)] text-[var(--text)]"
                }`}
                onClick={() => setTab("compose")}
              >
                {t("compose")}
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {migrationNeeded ? (
              <p className="p-4 text-sm text-amber-800 dark:text-amber-200">
                Выполните миграцию БД для таблицы in_app_notifications — список пока недоступен.
              </p>
            ) : null}

            {tab === "inbox" ? (
              <>
                {loading ? (
                  <p className="p-4 text-sm text-[var(--muted)]">{t("loading")}</p>
                ) : items.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted)]">{t("noNotifications")}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[var(--border)]">
                    {items.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] ${
                            row.readAt ? "opacity-90" : "bg-[var(--surface-soft)]/80"
                          }`}
                          onClick={() => setDetail(row)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                              {kindLabel(row.kind)}
                            </span>
                            {!row.readAt ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold text-[var(--text)]">{row.title}</span>
                          <span className="line-clamp-2 text-xs text-[var(--muted)]">{row.body}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                {user.baseRole !== "director" ? (
                  <p className="text-xs text-[var(--muted)]">{audienceHint(user.baseRole)}</p>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={directorAll}
                        onChange={(e) => setDirectorAll(e.target.checked)}
                      />
                      {t("toAll")}
                    </label>
                    {!directorAll ? (
                      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                        {DIRECTOR_ANNOUNCEMENT_TARGET_ROLES.map((r) => (
                          <label key={r} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={Boolean(directorRoles[r])}
                              onChange={(e) =>
                                setDirectorRoles((prev) => ({ ...prev, [r]: e.target.checked }))
                              }
                            />
                            {roleLabel(r)}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted2)]">{t("titleLabel")}</label>
                  <input
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    value={composeTitle}
                    onChange={(e) => setComposeTitle(e.target.value)}
                    placeholder="Кратко"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted2)]">{t("textLabel")}</label>
                  <textarea
                    className="input-field min-h-[140px] w-full rounded-xl px-3 py-2 text-sm"
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Текст объявления для выбранных сотрудников"
                  />
                </div>
                <button
                  type="button"
                  disabled={composeBusy || !composeBody.trim()}
                  className="btn-primary min-h-[44px] w-full rounded-xl text-sm font-medium"
                  onClick={() => void submitAnnouncement()}
                >
                  {composeBusy ? t("sending") : t("sendBtn")}
                </button>
                {composeError ? <p className="text-xs text-red-600 dark:text-red-400">{composeError}</p> : null}
              </div>
            )}
          </div>

          <details className="shrink-0 border-t border-[var(--border)] px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">
              {t("pushSection")}
            </summary>
            <div className="mt-2">
              <PushNotificationsControl />
            </div>
          </details>
        </div>
      </div>
    ) : null;

  const detailOverlay =
    detail && open && mounted ? (
      <div
        className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
        role="presentation"
        onMouseDown={(ev) => {
          if (ev.target === ev.currentTarget) setDetail(null);
        }}
      >
        <div className="flex max-h-[min(80vh,520px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <button type="button" className="btn-secondary rounded-xl px-3 py-1.5 text-sm" onClick={() => setDetail(null)}>
              {t("backBtn")}
            </button>
            {detail.linkUrl ? (
              <Link
                href={detail.linkUrl}
                className="btn-primary rounded-xl px-3 py-1.5 text-sm"
                onClick={() => setOpen(false)}
              >
                {t("openBtn")}
              </Link>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              {kindLabel(detail.kind)}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">{detail.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">{detail.body}</p>
            {detail.kind === "announcement" && detail.meta?.authorName ? (
              <p className="mt-4 text-xs text-[var(--muted)]">
                От: {String(detail.meta.authorName)}
                {detail.meta.authorRole ? ` · ${roleLabel(String(detail.meta.authorRole))}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        className="btn-secondary min-h-[44px] w-full justify-start rounded-xl px-3 text-sm font-medium"
        onClick={() => {
          setOpen(true);
          setDetail(null);
          setTab("inbox");
        }}
      >
        <span className="inline-flex items-center">
          {t("title")}
          {badge}
        </span>
      </button>
      {mounted ? createPortal(overlay, document.body) : null}
      {mounted ? createPortal(detailOverlay, document.body) : null}
    </>
  );
}
