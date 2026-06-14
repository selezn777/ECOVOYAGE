import {
  ACCOUNTING_PANEL_ROLES,
  CASH_VIEW_ROLES,
  ACCOUNTING_REPORTS_ACCESS_ROLES,
  DISPATCHER_PAGE_ROLES,
  FINANCE_PAGE_ROLES,
  RENTALS_PAGE_ROLES,
  SALES_POINT_LEADERSHIP_ROLES,
  TEAM_PAGE_ROLES,
  TICKETS_PAGE_ROLES,
} from "@/lib/role-policy";
import type { Role } from "@/lib/types";

export type NavItem = { href: string; labelKey: string; roles: readonly Role[] | null };

export function navItemIsActive(pathname: string, itemHref: string, allHrefs: readonly string[]): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  const item = itemHref.replace(/\/+$/, "") || "/";
  const matchesHref = (h: string) => {
    const x = h.replace(/\/+$/, "") || "/";
    return p === x || p.startsWith(`${x}/`);
  };
  if (!matchesHref(item)) return false;
  for (const h of allHrefs) {
    if (h === itemHref) continue;
    const x = h.replace(/\/+$/, "") || "/";
    if (x.length <= item.length) continue;
    if (!x.startsWith(`${item}/`)) continue;
    if (matchesHref(x)) return false;
  }
  return true;
}

export const navAll: NavItem[] = [
  { href: "/dashboard", labelKey: "tours", roles: null },
  { href: "/tourists", labelKey: "tourists", roles: ["director", "chief_manager", "manager", "guide", "chief_guide", "accountant"] },
  { href: "/cash", labelKey: "cash", roles: CASH_VIEW_ROLES },
  { href: "/accounting", labelKey: "accounting", roles: ACCOUNTING_PANEL_ROLES },
  { href: "/finance", labelKey: "finance", roles: FINANCE_PAGE_ROLES },
  { href: "/rentals", labelKey: "rentals", roles: RENTALS_PAGE_ROLES },
  { href: "/sales-points", labelKey: "salesPoints", roles: SALES_POINT_LEADERSHIP_ROLES },
  { href: "/tickets", labelKey: "tickets", roles: TICKETS_PAGE_ROLES },
  { href: "/team", labelKey: "team", roles: TEAM_PAGE_ROLES },
];

export function navForRole(role: Role): NavItem[] {
  if (role === "director") {
    const base = navAll.filter((item) => !item.roles || item.roles.includes(role));
    if (ACCOUNTING_REPORTS_ACCESS_ROLES.includes(role)) {
      return [...base, { href: "/accounting/reports", labelKey: "report", roles: null }];
    }
    return base;
  }
  if (role === "accountant") {
    return [
      { href: "/accounting", labelKey: "tours", roles: null },
      { href: "/cash", labelKey: "cash", roles: null },
      { href: "/tourists", labelKey: "tourists", roles: null },
      { href: "/accounting/reports", labelKey: "report", roles: null },
      { href: "/rentals", labelKey: "rentals", roles: null },
      { href: "/team", labelKey: "employees", roles: null },
    ];
  }
  if (DISPATCHER_PAGE_ROLES.includes(role)) {
    return [
      { href: "/dispatcher", labelKey: "workday", roles: null },
      { href: "/dashboard", labelKey: "tours", roles: null },
      { href: "/tickets", labelKey: "tickets", roles: null },
      { href: "/rentals", labelKey: "rentals", roles: null },
      { href: "/team", labelKey: "team", roles: null },
    ];
  }
  return navAll.filter((item) => !item.roles || item.roles.includes(role));
}
