"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Role } from "@/lib/types";
import { roleLabel } from "@/lib/role-labels";
import { useTranslations } from "next-intl";

const DIRECTOR_MANAGER_OPTIONS: Role[] = [
  "manager",
  "chief_manager",
  "guide",
  "chief_guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

function optionsForSession(sessionRole: Role, baseRole: Role): Role[] {
  if (baseRole === "director") return DIRECTOR_MANAGER_OPTIONS;
  if (sessionRole === "chief_guide") return ["guide"];
  if (sessionRole === "director") return DIRECTOR_MANAGER_OPTIONS;
  if (sessionRole === "chief_manager") return ["manager"];
  if (sessionRole === "dispatcher") return ["dispatcher", "booking_dispatcher"];
  return [];
}

export function TeamUserCreateForm({ sessionRole, baseRole }: { sessionRole: Role; baseRole: Role }) {
  const tT = useTranslations("team");
  const roleOptions = useMemo(() => optionsForSession(sessionRole, baseRole), [sessionRole, baseRole]);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<{
    fullName: string;
    login: string;
    password: string;
  } | null>(null);
  const [role, setRole] = useState<Role>(() => roleOptions[0]!);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (roleOptions.length === 0) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, login, password, role }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string | unknown;
        credentials?: { login?: string; password?: string };
      };
      if (!res.ok) {
        const err = json.error;
        setMessage(typeof err === "string" ? err : tT("createError"));
        return;
      }
      const createdLogin = json.credentials?.login?.trim() || login.trim();
      const createdPassword = json.credentials?.password || password;
      setLastCreatedCredentials({
        fullName: fullName.trim(),
        login: createdLogin,
        password: createdPassword,
      });
      setFullName("");
      setLogin("");
      setPassword("");
      setMessage(tT("createdSuccess"));
    } catch {
      setMessage(tT("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedCredentials() {
    if (!lastCreatedCredentials) return;
    const text = [
      `${tT("employeeLabel")}: ${lastCreatedCredentials.fullName || "—"}`,
      `${tT("loginLabel")}: ${lastCreatedCredentials.login}`,
      `${tT("passwordLabel")}: ${lastCreatedCredentials.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(tT("copiedSuccess"));
    } catch {
      setMessage(tT("copyError"));
    }
  }

  return (
    <section className="card mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left touch-manipulation"
      >
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">{tT("newEmployee")}</h2>
          {!open && <p className="mt-0.5 text-xs text-[var(--muted)]">{tT("openForm")}</p>}
        </div>
        <svg
          viewBox="0 0 20 20"
          className={`h-5 w-5 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          aria-hidden
        >
          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <form className="mt-3 grid max-w-lg gap-2 text-sm" onSubmit={onSubmit}>
          <label className="grid gap-0.5">
            <span className="text-xs text-[var(--muted)]">{tT("fullName")}</span>
            <input
              className="field-surface rounded-xl px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </label>
          <label className="grid gap-0.5">
            <span className="text-xs text-[var(--muted)]">{tT("login")}</span>
            <input
              className="field-surface rounded-xl px-3 py-2"
              value={login}
              onChange={(e) => setLogin(e.target.value.trim())}
              required
              minLength={2}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-0.5">
            <span className="text-xs text-[var(--muted)]">{tT("password")}</span>
            <input
              className="field-surface rounded-xl px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
              autoComplete="new-password"
            />
          </label>
          <label className="grid gap-0.5">
            <span className="text-xs text-[var(--muted)]">{tT("role")}</span>
            <select
              className="field-surface rounded-xl px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              required
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
          {lastCreatedCredentials ? (
            <div className="rounded-xl border border-emerald-300/70 bg-emerald-50/60 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/90">{tT("accessData")}</p>
              <p className="mt-1 text-[var(--text)]">
                <span className="text-[var(--muted)]">{tT("employeeLabel")}:</span> {lastCreatedCredentials.fullName || "—"}
              </p>
              <p className="text-[var(--text)]">
                <span className="text-[var(--muted)]">{tT("loginLabel")}:</span> {lastCreatedCredentials.login}
              </p>
              <p className="text-[var(--text)]">
                <span className="text-[var(--muted)]">{tT("passwordLabel")}:</span> {lastCreatedCredentials.password}
              </p>
              <button
                type="button"
                onClick={() => void copyCreatedCredentials()}
                className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
              >
                {tT("copyLoginPassword")}
              </button>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-fit rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? tT("creating") : tT("create")}
          </button>
        </form>
      )}
    </section>
  );
}
