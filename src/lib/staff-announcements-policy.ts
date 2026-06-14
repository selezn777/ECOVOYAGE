import type { Role } from "@/lib/types";

/** Роли, которым можно адресовать объявление директора. */
export const DIRECTOR_ANNOUNCEMENT_TARGET_ROLES: readonly Role[] = [
  "chief_manager",
  "chief_guide",
  "manager",
  "guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

export function canSendStaffAnnouncement(baseRole: Role): boolean {
  return (
    baseRole === "chief_manager" ||
    baseRole === "chief_guide" ||
    baseRole === "dispatcher" ||
    baseRole === "director"
  );
}

export function announcementRecipientsPreset(baseRole: Role): Role[] | "director_choice" {
  if (baseRole === "chief_manager") return ["manager"];
  if (baseRole === "chief_guide") return ["guide", "chief_guide"];
  if (baseRole === "dispatcher") return ["dispatcher", "booking_dispatcher"];
  if (baseRole === "director") return "director_choice";
  return [];
}
