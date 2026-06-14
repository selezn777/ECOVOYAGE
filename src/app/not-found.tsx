import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { getSessionUser } from "@/lib/auth-session";
import { defaultHomePathForRole } from "@/lib/role-policy";

export default async function NotFound() {
  const user = await getSessionUser();
  const homeHref = user ? defaultHomePathForRole(user.role) : "/dashboard";
  const homeLabel = "На главную";

  return (
    <main className="app-wrap app-wrap--narrow flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AppLogo size={56} />
      <div>
        <h1 className="page-title">Страница не найдена</h1>
        <p className="page-sub mx-auto max-w-xs">Проверьте адрес или вернитесь на главный экран.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={homeHref} className="btn-primary px-6">
          {homeLabel}
        </Link>
        <Link href="/login" className="btn-ghost py-2 text-[var(--accent)]">
          Вход
        </Link>
      </div>
    </main>
  );
}
