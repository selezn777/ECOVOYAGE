import type { RosterUser, Role } from "@/lib/types";

/** Порядок: директор → старший гид → ст. менеджер → менеджеры (по продажам) → гиды (по выездам) → офис. */
function roleSortRank(role: Role): number {
  switch (role) {
    case "director":
      return 0;
    case "chief_guide":
      return 1;
    case "chief_manager":
      return 2;
    case "manager":
      return 3;
    case "guide":
      return 4;
    case "accountant":
      return 5;
    case "dispatcher":
      return 6;
    case "booking_dispatcher":
      return 7;
  }
}

export function compareRosterUsers(a: RosterUser, b: RosterUser): number {
  const ra = roleSortRank(a.role);
  const rb = roleSortRank(b.role);
  if (ra !== rb) return ra - rb;

  if (a.role === "manager" && b.role === "manager") {
    return (b.salesCount ?? 0) - (a.salesCount ?? 0);
  }
  if (a.role === "chief_manager" && b.role === "chief_manager") {
    return (b.salesCount ?? 0) - (a.salesCount ?? 0);
  }
  if (a.role === "guide" && b.role === "guide") {
    return (b.guideTripsCount ?? 0) - (a.guideTripsCount ?? 0);
  }
  if (a.role === "chief_guide" && b.role === "chief_guide") {
    return (b.guideTripsCount ?? 0) - (a.guideTripsCount ?? 0);
  }

  return a.fullName.localeCompare(b.fullName, "ru");
}

export function groupSortedRosterUsers(sorted: RosterUser[]): { title: string; rows: RosterUser[] }[] {
  const leadershipRoles: Role[] = ["director", "chief_guide", "chief_manager", "dispatcher"];
  const leadership = sorted.filter((r) => leadershipRoles.includes(r.role));
  const managers = sorted.filter((r) => r.role === "manager");
  const guides = sorted.filter((r) => r.role === "guide");
  const rest = sorted.filter((r) => !leadershipRoles.includes(r.role) && r.role !== "manager" && r.role !== "guide");

  const out: { title: string; rows: RosterUser[] }[] = [];
  if (leadership.length) out.push({ title: "leadership", rows: leadership });
  if (managers.length) out.push({ title: "managers", rows: managers });
  if (guides.length) out.push({ title: "guides", rows: guides });
  if (rest.length) out.push({ title: "office", rows: rest });
  return out;
}
