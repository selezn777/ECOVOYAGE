import Link from "next/link";
import { RentalNewForm } from "@/components/rental-new-form";
import { TopNav } from "@/components/top-nav";
import { formatVnd } from "@/lib/format";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import { listRentalPoints } from "@/lib/data";
import { requireRoles } from "@/lib/auth-session";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

export default async function RentalsPage() {
  const user = await requireRoles([...RENTALS_PAGE_ROLES]);
  const points = await listRentalPoints();

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <header className="mb-3">
        <h1 className="text-lg font-semibold">Аренда турточек</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Учёт аренды, даты платежей, расходов и закрытых дней. Доступ: бухгалтерия и главный диспетчер.
        </p>
      </header>
      <RentalNewForm />
      {points.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Точек пока нет - создайте первую.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p) => (
            <li key={p.id} className="card flex flex-col gap-2">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
              ) : null}
              <Link href={`/rentals/${p.id}`} className="font-semibold text-[var(--text)] hover:underline">
                {p.name}
              </Link>
              <p className="text-xs text-[var(--muted)]">
                Аренда {formatVnd(p.monthlyRentVnd)}/мес · следующая оплата{" "}
                {p.nextRentPaymentDate ? formatYmdWithWeekdayRu(p.nextRentPaymentDate) : "не назначена"}
              </p>
              {p.addressNote ? <p className="text-xs text-[var(--muted2)]">{p.addressNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
