import Link from "next/link";
import { notFound } from "next/navigation";
import { RentalPointDetailClient } from "@/components/rental-point-detail-client";
import { TopNav } from "@/components/top-nav";
import { getRentalPointById } from "@/lib/data";
import { requireRoles } from "@/lib/auth-session";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

export default async function RentalPointPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles([...RENTALS_PAGE_ROLES]);
  const { id } = await params;
  const detail = await getRentalPointById(id);
  if (!detail) notFound();

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{detail.name}</h1>
        <Link href="/rentals" className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
          К списку точек
        </Link>
      </div>
      <RentalPointDetailClient initial={detail} />
    </main>
  );
}
