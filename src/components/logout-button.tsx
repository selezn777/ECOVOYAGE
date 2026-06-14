"use client";

import { useTranslations } from "next-intl";

export function LogoutButton() {
  const t = useTranslations("common");

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className="btn-secondary min-h-[44px] w-full justify-start rounded-xl px-3 text-sm font-medium"
      aria-label={t("logoutAccount")}
    >
      {t("logout")}
    </button>
  );
}
