"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** Нативная form POST → /api/auth/login: редирект 303 + cookie (на телефоне по IP надёжнее, чем fetch). */
export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const t = useTranslations("login");

  return (
    <form method="POST" action="/api/auth/login" className="space-y-3 text-left">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor="login">
          {t("loginLabel")}
        </label>
        <input
          id="login"
          name="login"
          className="input-app"
          placeholder={t("loginPlaceholder")}
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]" htmlFor="password">
          {t("passwordLabel")}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            className="input-app pr-11"
            placeholder={t("passwordPlaceholder")}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
      </div>
      <button type="submit" className="btn-primary mt-2 w-full">
        {t("submit")}
      </button>
    </form>
  );
}
