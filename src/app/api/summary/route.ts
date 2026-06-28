import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  calcSummaryDeterministic,
  summaryToArray,
  type RecordEvent,
} from "@/lib/summary";
import { getStaffByEmail, getTodayRange } from "@/lib/records";
import type { UserInfo } from "@/lib/records";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user: cachedUser } = body as { user: UserInfo };

    let user: UserInfo | null = null;
    if (cachedUser?.email) {
      user = await getStaffByEmail(cachedUser.email);
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "未登録" }, { status: 401 });
    }

    const { start, end, todayStr } = getTodayRange();
    const todayRecords = await prisma.record.findMany({
      where: {
        staffId: user.id,
        timestamp: { gte: start, lte: end },
      },
      orderBy: { timestamp: "asc" },
    });

    const recordEvents: RecordEvent[] = todayRecords.map((r) => ({
      time: r.timestamp,
      facility: r.facilityName,
      pid: r.patientId,
      eventType: r.eventType,
    }));

    const summary = calcSummaryDeterministic(
      recordEvents,
      user.staffName,
      user.jobType,
      user.workplace,
      todayStr
    );

    return NextResponse.json({
      success: true,
      summary: summary.map(summaryToArray),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");

  if (!staffId) {
    return NextResponse.json({ success: false, error: "staffId required" }, { status: 400 });
  }

  const { start, end } = getTodayRange();
  const logs = await prisma.record.findMany({
    where: {
      staffId,
      timestamp: { gte: start, lte: end },
    },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json({ success: true, logs });
}
