"use client";

import { useState } from "react";

type Props = {
  employeeId: string;
  employeeName: string;
};

export function TeamCredentialsPanel({ employeeId, employeeName }: Props) {
  const [busy, setBusy] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [login, setLogin] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadLogin() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(employeeId)}/credentials`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        credentials?: { login?: string };
      };
      if (!res.ok) {
        setMessage(json.error || "Не удалось получить логин");
        return;
      }
      setLogin(String(json.credentials?.login ?? ""));
      setTemporaryPassword(null);
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
        credentials?: { login?: string; temporaryPassword?: string };
      };
      if (!res.ok) {
        setMessage(json.error || "Не удалось обновить пароль");
        return;
      }
      setLogin(String(json.credentials?.login ?? ""));
      setTemporaryPassword(String(json.credentials?.temporaryPassword ?? pwd));
      setPasswordDraft("");
      setMessage("Новый пароль выдан. Скопируйте его сейчас: потом он не будет доступен для просмотра.");
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
        Пароль хранится в системе в зашифрованном виде. Старый пароль посмотреть нельзя: можно только показать логин
        и выдать новый временный пароль сотруднику {employeeName}.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void loadLogin()}
          disabled={busy}
          className="btn-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Загрузка…" : "Показать логин"}
        </button>
      </div>

      {login != null ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm">
          <div>
            <span className="text-[var(--muted)]">Логин:</span> <span className="font-medium">{login || "—"}</span>
          </div>
        </div>
      ) : null}

      {temporaryPassword ? (
        <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/35">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
            Новый временный пароль
          </div>
          <div className="mt-1 break-all text-base font-semibold text-[var(--text)]">{temporaryPassword}</div>
          <p className="mt-1 text-xs text-[var(--muted)]">Показывается один раз после сброса.</p>
        </div>
      ) : null}

      <div className="mt-3 grid max-w-md gap-2 text-sm">
        <label className="grid gap-0.5">
          <span className="text-xs text-[var(--muted)]">Новый временный пароль</span>
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
          {busy ? "Сохранение…" : "Выдать новый пароль"}
        </button>
      </div>

      {message ? <p className="mt-2 text-xs text-[var(--muted)]">{message}</p> : null}
    </section>
  );
}
