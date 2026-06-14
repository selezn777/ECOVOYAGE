const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True if session id looks like a Supabase `users.id` (not demo string ids). */
export function isUuidSessionUser(sessionUserId: string): boolean {
  return UUID_RE.test(sessionUserId);
}

export function actorUuidOrNull(sessionUserId: string): string | null {
  return UUID_RE.test(sessionUserId) ? sessionUserId : null;
}
