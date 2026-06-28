export type LocalPatient = {
  pid: string;
  displayName: string;
};

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
export const PATIENTS_STORAGE_KEY = "kikunan_patients";

export function loadPatients(): LocalPatient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalPatient[];
    const legacy = loadPatientNames();
    const migrated = Object.entries(legacy).map(([pid, displayName]) => ({
      pid,
      displayName,
    }));
    if (migrated.length) savePatients(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function savePatients(patients: LocalPatient[]) {
  localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients));
  const map: Record<string, string> = {};
  for (const p of patients) map[p.pid] = p.displayName;
  savePatientNames(map);
}

export function patientDisplayName(
  pid: string,
  patients: LocalPatient[],
  legacyMap?: Record<string, string>
): string {
  if (!pid || pid === "不明" || pid === "解析失敗") return pid || "不明";
  const found = patients.find((p) => p.pid === pid);
  if (found) return found.displayName;
  if (legacyMap?.[pid]) return legacyMap[pid];
  return pid;
}

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
  if (ev.startsWith("カルテ")) return "b-chart";
  if (ev.startsWith("注射")) return "b-injection";
  if (ev.startsWith("点滴")) return "b-drip";
  if (ev.startsWith("バイタル")) return "b-vital";
  if (ev.startsWith("処置")) return "b-procedure";
  return "b-unknown";
}

export function safeBadge(val: string | number, cls: string): string {
  const p = parseFloat(String(val));
  if (isNaN(p)) return "dash";
  return `${Math.round(p)}|${cls}`;
}
