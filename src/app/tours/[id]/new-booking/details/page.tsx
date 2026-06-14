import { redirect } from "next/navigation";

/** Старый шаг 2 — теперь всё на одной странице. */
export default async function NewBookingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (!v) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, v);
  }
  const qs = p.toString();
  redirect(`/tours/${id}/new-booking${qs ? `?${qs}` : ""}`);
}
