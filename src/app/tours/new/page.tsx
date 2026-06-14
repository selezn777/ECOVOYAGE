import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { NewTourForm } from "@/components/new-tour-form";
import { requireAuth } from "@/lib/auth-session";
import { canCreateTour } from "@/lib/role-policy";

export default async function NewTourPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireAuth();
  if (!canCreateTour(user.role)) {
    redirect("/dashboard");
  }
  const sp = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || "") ? (sp.date as string) : "";

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <section className="card mb-3">
        <p className="section-label mb-1">Тур</p>
        <h1 className="page-title">Открыть тур</h1>
      </section>
      <NewTourForm initialDate={initialDate} viewerRole={user.role} />
    </main>
  );
}
