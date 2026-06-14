"use client";

import { useState } from "react";

type Props = {
  employeeId: string;
  employeeName: string;
};

export function TeamCredentialsPanel({ employeeId, employeeName }: Props) {
  const [busy, setBusy] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadCredentials() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(employeeId)}/credentials`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        credentials?: { login?: string; password?: string };
      };
      if (!res.ok) {
        setMessage(json.error || "Не удалось получить логин/пароль");
        return;
      }
      setCredentials({
        login: String(json.credentials?.login ?? ""),
        password: String(json.credentials?.password ?? ""),
      });
    } catch {
      setMessage("Сетевая ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pwd = passwordDraft.trim();
    if (pwd.length < 4) {
      setMessage("Минимум 4 символа в пароле");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(employeeId)}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        credentials?: { login?: string; password?: string };
      };
      if (!res.ok) {
        setMessage(json.error || "Не удалось обновить пароль");
        return;
      }
      setCredentials({
        login: String(json.credentials?.login ?? ""),
        password: String(json.credentials?.password ?? ""),
      });
      setPasswordDraft("");
      setMessage("Пароль обновлён.");
    } catch {
      setMessage("Сетевая ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3">
      <h2 className="text-base font-semibold text-[var(--text)]">Доступ сотрудника</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Логин и пароль для входа сотрудника {employeeName}. Используйте только для служебной выдачи.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void loadCredentials()}
          disabled={busy}
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Загрузка…" : "Показать логин/пароль"}
        </button>
      </div>

      {credentials ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm">
          <div>
            <span className="text-[var(--muted)]">Логин:</span> <span className="font-medium">{credentials.login || "—"}</span>
          </div>
          <div className="mt-1">
            <span className="text-[var(--muted)]">Пароль:</span> <span className="font-medium">{credentials.password || "—"}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid max-w-md gap-2 text-sm">
        <label className="grid gap-0.5">
          <span className="text-xs text-[var(--muted)]">Новый пароль сотрудника</span>
          <input
            className="field-surface rounded-xl px-3 py-2"
            type="text"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            minLength={4}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => void resetPassword()}
          disabled={busy}
          className="w-fit rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Сохранение…" : "Сбросить пароль"}
        </button>
      </div>

      {message ? <p className="mt-2 text-xs text-[var(--muted)]">{message}</p> : null}
    </section>
  );
}
