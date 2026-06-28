import {
  addFacilityToSheet,
  getFacilityListFromSheet,
  isSheetsConfigured,
  readTodayRecordsFromSheet,
} from "./sheets";
import type { RecordEvent } from "./summary";

export async function writeLog(action: string, details: string, email?: string | null) {
  if (process.env.NODE_ENV === "development") {
    console.log("[log]", action, details, email ?? "");
  }
}

export function getTodayRange(): { start: Date; end: Date; todayStr: string } {
  const now = new Date();
  const todayStr = formatDateLocal(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end, todayStr };
}

export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTimeLocal(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export type UserInfo = {
  id: string;
  staffName: string;
  jobType: string;
  workplace: string;
  email: string;
};

export function buildUserEmail(staffName: string, jobType: string, workplace: string): string {
  return `local_${staffName}_${jobType}_${workplace}`.replace(/\s/g, "_");
}

export function normalizeUser(raw: Partial<UserInfo> | null | undefined): UserInfo | null {
  if (!raw?.staffName || !raw.jobType || !raw.workplace) return null;
  const email = raw.email || buildUserEmail(raw.staffName, raw.jobType, raw.workplace);
  return {
    id: raw.id || email,
    email,
    staffName: raw.staffName,
    jobType: raw.jobType,
    workplace: raw.workplace,
  };
}

export async function getStaffByEmail(_email: string): Promise<UserInfo | null> {
  return null;
}

export async function getFacilityList(): Promise<string[]> {
  if (!isSheetsConfigured()) return [];
  return getFacilityListFromSheet();
}

export async function addFacility(name: string): Promise<void> {
  await addFacilityToSheet(name);
}

export async function getTodayRecordEvents(user: UserInfo, todayStr: string): Promise<RecordEvent[]> {
  const rows = await readTodayRecordsFromSheet(
    user.staffName,
    user.jobType,
    user.workplace,
    todayStr
  );
  return rows.map((r) => ({
    time: r.timestamp,
    facility: r.facilityName,
    pid: r.patientId,
    eventType: r.eventType,
  }));
}
