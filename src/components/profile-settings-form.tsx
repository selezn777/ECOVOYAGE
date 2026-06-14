"use client";

import { useState } from "react";
import { ProfileWhatsAppInput } from "@/components/profile-whatsapp-input";

export function ProfileSettingsForm({
  initialFullName,
  initialLogin,
  initialPhone,
  canSave,
}: {
  initialFullName: string;
  initialLogin: string;
  initialPhone: string;
  canSave: boolean;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [login, setLogin] = useState(initialLogin);
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) {
      alert("Войдите под пользователем из Supabase (UUID), не под демо admin.");
      return;
    }
    setBusy(true);
    try {
      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length < 8) {
        alert("Укажите номер WhatsApp (не меньше 8 цифр, с кодом страны), чтобы коллеги могли написать вам.");
        return;
      }
      const body: { fullName?: string; password?: string; login?: string; phone?: string } = {};
      if (fullName.trim() && fullName.trim() !== initialFullName) body.fullName = fullName.trim();
      if (login.trim() !== initialLogin.trim()) body.login = login.trim();
      if (password) body.password = password;
      if (phone.trim() !== initialPhone.trim()) body.phone = phone.trim();
      if (!body.fullName && !body.password && body.login === undefined && body.phone === undefined) {
        alert("Измените имя, логин, телефон или введите новый пароль");
        return;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : Array.isArray(json.error?.formErrors) && json.error.formErrors[0]
              ? String(json.error.formErrors[0])
              : "Не удалось сохранить";
        throw new Error(msg);
      }
      setPassword("");
      alert("Сохранено");
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card mb-3 space-y-2">
      <h2 className="text-base font-semibold">Логин, имя, телефон и пароль</h2>

      {!canSave ? (
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Демо-логин{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-950/50 dark:text-amber-100">admin/admin</code> не
          обновляет профиль. Создайте
          пользователя в Supabase (
          <code className="rounded bg-[var(--surface-soft)] px-1 ring-1 ring-[var(--border)]">users</code>) и войдите по
          логину и паролю.
        </p>
      ) : null}
      <ProfileWhatsAppInput value={phone} onChange={setPhone} disabled={busy || !canSave} />
      <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Логин для входа</label>
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        className="field-surface w-full rounded-xl px-3 py-2"
        placeholder="Например ivan_g"
        autoComplete="username"
      />
      <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Полное имя</label>
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="field-surface w-full rounded-xl px-3 py-2"
        placeholder="Как отображается в системе"
        autoComplete="name"
      />
      <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Новый пароль</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="field-surface w-full rounded-xl px-3 py-2"
        placeholder="Оставьте пустым, если не меняете"
        type="password"
        autoComplete="new-password"
      />
      <button
        type="submit"
        disabled={busy || !canSave}
        className="btn-primary rounded-xl px-3 py-2 disabled:opacity-50"
      >
        {busy ? "Сохранение…" : "Сохранить"}
      </button>
    </form>
  );
}
