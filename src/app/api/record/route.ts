import { NextResponse } from "next/server";
import { extractEventInfo, type ParsedEvent } from "@/lib/claude";
import {
  buildDailySummaries,
  facilitySummaryToArray,
  summaryToArray,
  taskTypeSummaryToArray,
} from "@/lib/summary";
import {
  appendRecordRowsToSheet,
  assertSheetsConfigured,
  isSheetsConfigured,
  syncDailySummariesToSheet,
  type SheetRecordRow,
} from "@/lib/sheets";
import {
  formatTimeLocal,
  getFacilityList,
  getTodayRecordEvents,
  getTodayRange,
  normalizeUser,
  writeLog,
  type UserInfo,
} from "@/lib/records";

function resolvePatientId(_eventType: string, selectedPatientPid?: string | null): string {
  return selectedPatientPid || "不明";
}

function mergeEvents(
  events: ParsedEvent[],
  selectedPatientPid?: string | null
): Array<ParsedEvent & { patientId: string }> {
  return events.map((ev) => ({
    ...ev,
    patientId: resolvePatientId(ev.eventType, selectedPatientPid),
  }));
}

export async function POST(request: Request) {
  try {
    if (!isSheetsConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Sheets が未設定です。環境変数 GOOGLE_SHEETS_* を設定してください。",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { utterance, user: cachedUser, selectedPatientPid } = body as {
      utterance: string;
      user: UserInfo;
      selectedPatientPid?: string | null;
    };

    if (!utterance?.trim()) {
      return NextResponse.json({ success: false, error: "発話内容が空です。" }, { status: 400 });
    }

    const user = normalizeUser(cachedUser);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "ユーザー設定がされていません。" },
        { status: 401 }
      );
    }

    const facilityList = await getFacilityList();
    let rawEvents: ParsedEvent[];
    try {
      rawEvents = await extractEventInfo(utterance, facilityList);
    } catch (err) {
      const message = err instanceof Error ? err.message : "解析に失敗しました";
      await writeLog("AI解析エラー", message, user.email);
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    let events = mergeEvents(rawEvents, selectedPatientPid);

    const timestamp = new Date();
    const sheetRows: SheetRecordRow[] = events.map((ev) => ({
      timestamp,
      staffName: user.staffName,
      jobType: user.jobType,
      workplace: user.workplace,
      facilityName: ev.facilityName,
      maskedUtterance: utterance.trim(),
      patientId: ev.patientId,
      eventType: ev.eventType,
    }));

    assertSheetsConfigured();
    await appendRecordRowsToSheet(sheetRows);

    const { todayStr } = getTodayRange();
    const recordEvents = await getTodayRecordEvents(user, todayStr);
    const { patientSummary, facilitySummary, taskSummary } = buildDailySummaries(
      recordEvents,
      user.staffName,
      user.jobType,
      user.workplace,
      todayStr
    );

    await syncDailySummariesToSheet(patientSummary, facilitySummary, todayStr);

    const timeStr = formatTimeLocal(timestamp);
    const rowsForClient = events.map((ev) => [
      timeStr,
      user.staffName,
      user.jobType,
      user.workplace,
      ev.facilityName,
      utterance,
      ev.patientId,
      ev.eventType,
    ]);

    await writeLog("データ登録", `${user.staffName}さんが業務を記録`, user.email);

    return NextResponse.json({
      success: true,
      message: `${user.staffName}さんの業務記録を処理しました`,
      data: rowsForClient,
      summary: patientSummary.map(summaryToArray),
      facilitySummary: facilitySummary.map(facilitySummaryToArray),
      taskSummary: taskSummary.map(taskTypeSummaryToArray),
      sheetsSynced: true,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
