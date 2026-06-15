import { TopNav } from "@/components/top-nav";
import { ProfileDaysOffPanel } from "@/components/profile-days-off";
import { ProfileManagerModeToggle } from "@/components/profile-manager-mode-toggle";
import { ProfileManagerSalesPointCard, type ProfileWeekScheduleDay } from "@/components/profile-manager-sales-point-card";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { requireAuth } from "@/lib/auth-session";
import { isUuidSessionUser } from "@/lib/actor-id";
import {
  getManagerSalesPointStatus,
  getSalesPointAssignmentSnapshot,
  getUserAccountFields,
  getUserPerformanceSnapshot,
  listMyVisaRuns,
  listMyGuideDaysOff,
  listMyManagerDaysOff,
} from "@/lib/data";
import { nextDaysYmd, tourBusinessTodayYmd } from "@/lib/scheduling";
import type { Role } from "@/lib/types";

async function ProfilePerformanceCard({ userId, role }: { userId: string; role: Role }) {
  if (role !== "guide" && role !== "chief_guide" && role !== "manager" && role !== "chief_manager") {
    return null;
  }
  const s = await getUserPerformanceSnapshot(userId, role);
  if (role === "guide" || role === "chief_guide") {
    const trips = s.guideTripsCount ?? 0;
    return (
      <section className="card mb-3">
        <h2 className="text-base font-semibold text-[var(--text)]">Выезды</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Всего назначенных туров:{" "}
          <span className="font-semibold text-[var(--accent)]">{trips}</span>
        </p>
      </section>
    );
  }
  const sales = s.salesCount ?? 0;
  const mr = s.managerReviewsCount ?? 0;
  return (
    <section className="card mb-3">
      <h2 className="text-base font-semibold text-[var(--text)]">Продажи и оценка</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Активных броней (ваши продажи):{" "}
        <span className="font-semibold text-[var(--accent)]">{sales}</span>
      </p>
      {mr > 0 ? (
        <p className="mt-1 text-sm text-[var(--muted)]">
          Средняя оценка руководства:{" "}
          <span className="font-semibold text-[var(--accent)]">★ {s.managerRatingAvg}</span> ({mr}{" "}
          {mr === 1 ? "отзыв" : mr < 5 ? "отзыва" : "отзывов"})
        </p>
      ) : null}
    </section>
  );
}

export default async function ProfilePage() {
  const user = await requireAuth();
  const canEditProfile = isUuidSessionUser(user.id);
  const account = canEditProfile
    ? await getUserAccountFields(user.id)
    : { login: null, avatarUrl: null, phone: null };
  const managerOff =
    user.role === "manager" || user.role === "chief_manager" ? await listMyManagerDaysOff(user.id) : [];
  const guideOff =
    user.role === "guide" || user.role === "chief_guide" ? await listMyGuideDaysOff(user.id) : [];
  const managerVisaRuns =
    user.role === "manager" || user.role === "chief_manager" ? await listMyVisaRuns(user.id, "manager") : [];
  const guideVisaRuns =
    user.role === "guide" || user.role === "chief_guide" ? await listMyVisaRuns(user.id, "guide") : [];
  const managerPointStatus = user.role === "manager" ? await getManagerSalesPointStatus(user.id) : null;
  let weekSchedule: ProfileWeekScheduleDay[] | undefined;
  if (user.role === "manager") {
    const todayYmd = tourBusinessTodayYmd();
    const next7Days = nextDaysYmd(todayYmd, 7);
    const snapshot = await getSalesPointAssignmentSnapshot([user.id], todayYmd, next7Days[next7Days.length - 1]);
    const offDays = new Set(snapshot.managerDaysOff[user.id] ?? []);
    weekSchedule = next7Days.map((ymd) => ({
      ymd,
      assignment: snapshot.managerAssignmentsByDay[user.id]?.[ymd],
      isOff: offDays.has(ymd),
    }));
  }
  const showGuideManagerToggle = user.baseRole === "guide" || user.baseRole === "chief_guide";

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <h1 className="page-title mb-3">Профиль</h1>

      <ProfilePerformanceCard userId={user.id} role={user.role} />
      {managerPointStatus ? (
        <ProfileManagerSalesPointCard initial={managerPointStatus} managerId={user.id} weekSchedule={weekSchedule} />
      ) : null}

      {showGuideManagerToggle ? <ProfileManagerModeToggle initialEnabled={Boolean(user.managerMode)} /> : null}

      <ProfileSettingsForm
        initialFullName={user.fullName}
        initialLogin={account.login ?? ""}
        initialPhone={account.phone ?? ""}
        canSave={canEditProfile}
      />

      {user.role === "manager" || user.role === "chief_manager" ? (
        <div className="mb-3">
          <ProfileDaysOffPanel mode="manager" userId={user.id} initialDates={managerOff} initialVisaRuns={managerVisaRuns} />
        </div>
      ) : null}
      {user.role === "guide" || user.role === "chief_guide" ? (
        <ProfileDaysOffPanel mode="guide" userId={user.id} initialDates={guideOff} initialVisaRuns={guideVisaRuns} />
      ) : null}
    </main>
  );
}
