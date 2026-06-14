import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { AppLogo } from "@/components/app-logo";
import { getSessionUser } from "@/lib/auth-session";
import { defaultHomePathForRole } from "@/lib/role-policy";
import { getTranslations } from "next-intl/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(defaultHomePathForRole(user.role));

  const q = await searchParams;
  const t = await getTranslations("login");

  const errMsg =
    q.err === "auth"
      ? t("errorAuth")
      : q.err === "form"
        ? t("errorForm")
        : null;

  return (
    <main className="app-wrap app-wrap--narrow flex min-h-screen flex-col justify-center">
      <div className="card text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <AppLogo size={72} priority />
          <div>
            <h1 className="page-title">Asia Mix</h1>
            <p className="page-sub mx-auto max-w-[280px]">{t("subtitle")}</p>
          </div>
        </div>
        {errMsg ? (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-left text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {errMsg}
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
