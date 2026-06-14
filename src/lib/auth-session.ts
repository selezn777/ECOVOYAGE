import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Role, SessionUser } from "@/lib/types";

const COOKIE_NAME = "amx_session_v2";
export const MANAGER_MODE_COOKIE_NAME = "amx_manager_mode";
export const DIRECTOR_VIEW_AS_COOKIE_NAME = "amx_director_view_as";

export const DIRECTOR_VIEW_AS_ROLES: Role[] = [
  "chief_manager", "manager", "chief_guide", "guide", "dispatcher", "booking_dispatcher", "accountant",
];

/** Логин демо-аккаунта. Изолирован от реальных данных. */
export const DEMO_LOGIN = "test";

const VALID_ROLES: Role[] = [
  "director", "chief_manager", "manager", "chief_guide",
  "guide", "accountant", "dispatcher", "booking_dispatcher",
];

function normalizeRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  const r = raw.trim().toLowerCase();
  return VALID_ROLES.includes(r as Role) ? (r as Role) : null;
}

export function encodeSession(user: Pick<SessionUser, "id" | "fullName" | "role" | "avatarUrl" | "login">): string {
  const payload = {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    ...(user.login ? { login: user.login } : {}),
    ...(user.avatarUrl !== undefined && user.avatarUrl !== null ? { avatarUrl: user.avatarUrl } : {}),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeSession(value: string): Pick<SessionUser, "id" | "fullName" | "role" | "avatarUrl" | "login"> | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!parsed?.id || !parsed?.fullName) return null;
    const role = normalizeRole(parsed.role);
    if (!role) return null;
    const avatarUrl =
      "avatarUrl" in parsed && (parsed.avatarUrl === null || typeof parsed.avatarUrl === "string")
        ? (parsed.avatarUrl as string | null)
        : undefined;
    const login = typeof parsed.login === "string" ? parsed.login : undefined;
    return { id: String(parsed.id), fullName: String(parsed.fullName), role, avatarUrl, login };
  } catch {
    return null;
  }
}

/** Демо-сессия — полная изоляция от реальных данных */
export function isDemoUser(session: SessionUser): boolean {
  return session.login === DEMO_LOGIN;
}

function effectiveRoleForManagerMode(baseRole: Role, managerMode: boolean): Role {
  if (!managerMode) return baseRole;
  if (baseRole === "guide") return "manager";
  if (baseRole === "chief_guide") return "manager";
  return baseRole;
}

function directorViewAsRoleFromCookie(raw: string | undefined): Role | null {
  if (!raw) return null;
  const r = normalizeRole(raw);
  if (!r || !DIRECTOR_VIEW_AS_ROLES.includes(r)) return null;
  return r;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const decoded = decodeSession(raw);
  if (!decoded) return null;
  const baseRole = decoded.role;
  const managerModeCookie =
    (baseRole === "guide" || baseRole === "chief_guide") && jar.get(MANAGER_MODE_COOKIE_NAME)?.value === "1";
  let role = effectiveRoleForManagerMode(baseRole, managerModeCookie);
  if (baseRole === "director") {
    const viewAs = directorViewAsRoleFromCookie(jar.get(DIRECTOR_VIEW_AS_COOKIE_NAME)?.value);
    if (viewAs) role = viewAs;
  }
  return {
    id: decoded.id,
    fullName: decoded.fullName,
    login: decoded.login,
    role,
    baseRole,
    managerMode: managerModeCookie || undefined,
    avatarUrl: decoded.avatarUrl,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRoles(roles: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) notFound();
  return user;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
