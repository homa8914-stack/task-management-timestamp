import { NextResponse } from "next/server";
import {
  buildDailySummaries,
  facilitySummaryToArray,
  summaryToArray,
  taskTypeSummaryToArray,
} from "@/lib/summary";
import { isSheetsConfigured } from "@/lib/sheets";
import { getTodayRange, getTodayRecordEvents, normalizeUser, type UserInfo } from "@/lib/records";

export async function POST(request: Request) {
  try {
    if (!isSheetsConfigured()) {
      return NextResponse.json(
        { success: false, error: "Google Sheets が未設定です。" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { user: cachedUser } = body as { user: UserInfo };

    const user = normalizeUser(cachedUser);
    if (!user) {
      return NextResponse.json({ success: false, error: "未登録" }, { status: 401 });
    }

    const { todayStr } = getTodayRange();
    const recordEvents = await getTodayRecordEvents(user, todayStr);
    const { patientSummary, facilitySummary, taskSummary } = buildDailySummaries(
      recordEvents,
      user.staffName,
      user.jobType,
      user.workplace,
      todayStr
    );

    return NextResponse.json({
      success: true,
      summary: patientSummary.map(summaryToArray),
      facilitySummary: facilitySummary.map(facilitySummaryToArray),
      taskSummary: taskSummary.map(taskTypeSummaryToArray),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "集計は POST で user を送ってください。",
  });
}
