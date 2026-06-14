import { TopNav } from "@/components/top-nav";
import { requireRoles } from "@/lib/auth-session";
import { DELETED_PAGE_ROLES } from "@/lib/role-policy";
import { listDeletedBookings } from "@/lib/data";
import { DeletedRestoreList } from "@/components/deleted-restore-list";

export default async function DeletedPage() {
  const user = await requireRoles([...DELETED_PAGE_ROLES]);
  const deletedBookings = await listDeletedBookings();

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <section className="card mb-2">
        <h1 className="text-lg font-semibold">Удалённые брони</h1>
        <p className="text-sm text-[var(--muted)]">Мягкое удаление; восстановление в течение 1 часа.</p>
      </section>
      <DeletedRestoreList items={deletedBookings} />
    </main>
  );
}
