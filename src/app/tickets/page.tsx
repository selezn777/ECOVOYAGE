import { getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { TicketSaleForm } from "@/components/ticket-sale-form";
import { TicketTemplateManager } from "@/components/ticket-template-manager";
import { TicketSalesHistory } from "@/components/ticket-sales-history";
import { DispatcherTicketSalesLive } from "@/components/dispatcher-ticket-sales-live";
import { requireRoles } from "@/lib/auth-session";
import { TICKETS_PAGE_ROLES } from "@/lib/role-policy";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const t = await getTranslations("tickets");
  const user = await requireRoles([...TICKETS_PAGE_ROLES]);

  const isAdmin = user.role === "director" || user.role === "chief_manager";
  const canSell =
    user.role === "director" ||
    user.role === "chief_manager" ||
    user.role === "manager" ||
    user.role === "accountant";
  const isDispatcher =
    user.role === "dispatcher" || user.role === "booking_dispatcher";

  return (
    <main className="app-wrap">
      <TopNav user={user} />

      <section className="card mb-3">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{t("subtitle")}</p>
      </section>

      {canSell ? (
        <section className="card mb-3">
          <h2 className="mb-2 text-base font-semibold">{t("newSale")}</h2>
          <TicketSaleForm />
        </section>
      ) : null}

      {isDispatcher ? <DispatcherTicketSalesLive /> : null}

      {canSell ? (
        <section className="card mb-3">
          <h2 className="mb-3 text-base font-semibold">{t("mySales")}</h2>
          <TicketSalesHistory />
        </section>
      ) : null}

      {isAdmin ? <TicketTemplateManager /> : null}
    </main>
  );
}
