import { prisma } from "./db";

export async function writeLog(action: string, details: string, email?: string | null) {
  try {
    await prisma.accessLog.create({
      data: {
        action,
        details,
        email: email || null,
      },
    });
  } catch {
    // logging should not break main flow
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

export async function getStaffByEmail(email: string): Promise<UserInfo | null> {
  const staff = await prisma.staff.findUnique({ where: { email } });
  if (!staff) return null;
  return {
    id: staff.id,
    staffName: staff.staffName,
    jobType: staff.jobType,
    workplace: staff.workplace,
    email: staff.email,
  };
}

export async function getFacilityList(): Promise<string[]> {
  const facilities = await prisma.facility.findMany({ orderBy: { name: "asc" } });
  return facilities.map((f) => f.name);
}
