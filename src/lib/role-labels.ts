import type { Role } from "@/lib/types";

const LABEL_RU: Record<Role, string> = {
  director: "Директор",
  chief_manager: "Главный менеджер",
  chief_guide: "Главный гид",
  manager: "Менеджер",
  guide: "Гид",
  accountant: "Бухгалтер",
  dispatcher: "Главный диспетчер",
  booking_dispatcher: "Диспетчер букинга",
};

const LABEL_EN: Record<Role, string> = {
  director: "Director",
  chief_manager: "Chief Manager",
  chief_guide: "Chief Guide",
  manager: "Manager",
  guide: "Guide",
  accountant: "Accountant",
  dispatcher: "Chief Dispatcher",
  booking_dispatcher: "Booking Dispatcher",
};

const LABEL_VI: Record<Role, string> = {
  director: "Giám đốc",
  chief_manager: "Trưởng quản lý",
  chief_guide: "Trưởng hướng dẫn viên",
  manager: "Quản lý",
  guide: "Hướng dẫn viên",
  accountant: "Kế toán",
  dispatcher: "Trưởng điều phối",
  booking_dispatcher: "Điều phối đặt chỗ",
};

const SCOPE: Record<Role, string | null> = {
  director: null,
  chief_manager: null,
  chief_guide: null,
  manager: null,
  guide: null,
  accountant: null,
  dispatcher: null,
  booking_dispatcher: null,
};

function getLocale(): string {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
    return m?.[1] ?? "ru";
  }
  return "ru";
}

function labelMap(locale?: string): Record<Role, string> {
  const loc = locale ?? getLocale();
  if (loc === "en") return LABEL_EN;
  if (loc === "vi") return LABEL_VI;
  return LABEL_RU;
}

/** @deprecated Use roleLabel() with locale */
export function roleLabelRu(role: string): string {
  return LABEL_RU[role as Role] ?? role;
}

/** @deprecated Use roleTitle() with locale */
export function roleTitleRu(role: string): string {
  return LABEL_RU[role as Role] ?? role;
}

/** Locale-aware role label. Pass locale explicitly on server, omit on client (reads cookie). */
export function roleLabel(role: string, locale?: string): string {
  return labelMap(locale)[role as Role] ?? role;
}

export function roleScopeRu(role: string): string | null {
  return SCOPE[role as Role] ?? null;
}
