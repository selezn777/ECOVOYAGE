import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { RentalNewForm } from "@/components/rental-new-form";
import { TopNav } from "@/components/top-nav";
import { formatVnd } from "@/lib/format";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { listRentalPoints } from "@/lib/data";
import { requireRoles } from "@/lib/auth-session";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

export default async function RentalsPage() {
  const user = await requireRoles([...RENTALS_PAGE_ROLES]);
  const points = await listRentalPoints();
  const t = await getTranslations("rental");
  const locale = await getLocale();

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <header className="mb-3">
        <h1 className="text-lg font-semibold">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("pageDescription")}</p>
      </header>
      <RentalNewForm />
      {points.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("noPointsYet")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p) => (
            <li key={p.id} className="card flex flex-col gap-2">
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt="" width={420} height={180} unoptimized className="h-32 w-full rounded-lg object-cover" />
              ) : null}
              <Link href={`/rentals/${p.id}`} className="font-semibold text-[var(--text)] hover:underline">
                {p.name}
              </Link>
              <p className="text-xs text-[var(--muted)]">
                {t("pointListRentLine", {
                  amount: formatVnd(p.monthlyRentVnd),
                  date: p.nextRentPaymentDate ? formatYmdWithWeekday(p.nextRentPaymentDate, locale) : t("notAssigned"),
                })}
              </p>
              {p.addressNote ? <p className="text-xs text-[var(--muted2)]">{p.addressNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
