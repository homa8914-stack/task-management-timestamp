export type UserInfo = {
  id: string;
  email: string;
  staffName: string;
  jobType: string;
  workplace: string;
};

export type RecordRow = (string | number)[];

export type LogEntry = {
  time: string;
  rows: RecordRow[];
  utterance: string;
};

export const USER_STORAGE_KEY = "kikunan_user";
export const NAMES_STORAGE_KEY = "kikunan_patient_names";

export function loadUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: UserInfo) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function loadPatientNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(NAMES_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function savePatientNames(map: Record<string, string>) {
  localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(map));
}

export function badgeClass(ev: string): string {
  if (ev === "出発") return "b-depart";
  if (ev === "到着") return "b-arrive";
  if (ev === "開始") return "b-start";
  if (ev === "終了") return "b-end";
  return "b-unknown";
}

export function safeBadge(val: string | number, cls: string): string {
  const p = parseFloat(String(val));
  if (isNaN(p)) return "dash";
  return `${Math.round(p)}|${cls}`;
}
