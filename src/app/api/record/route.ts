import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractRecordInfo } from "@/lib/claude";
import { generatePid, maskUtterance } from "@/lib/hash";
import {
  calcSummaryDeterministic,
  summaryToArray,
  type RecordEvent,
} from "@/lib/summary";
import {
  formatTimeLocal,
  getFacilityList,
  getStaffByEmail,
  getTodayRange,
  writeLog,
  type UserInfo,
} from "@/lib/records";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { utterance, user: cachedUser } = body as {
      utterance: string;
      user: UserInfo;
    };

    if (!utterance?.trim()) {
      return NextResponse.json({ success: false, error: "発話内容が空です。" }, { status: 400 });
    }

    let user: UserInfo | null = null;
    if (cachedUser?.email) {
      user = await getStaffByEmail(cachedUser.email);
    }
    if (!user && cachedUser?.id) {
      const staff = await prisma.staff.findUnique({ where: { id: cachedUser.id } });
      if (staff) {
        user = {
          id: staff.id,
          email: staff.email,
          staffName: staff.staffName,
          jobType: staff.jobType,
          workplace: staff.workplace,
        };
      }
    }
    if (!user) {
      return NextResponse.json(
        { success: false, error: "ユーザー設定がされていません。" },
        { status: 401 }
      );
    }

    const facilityList = await getFacilityList();
    const events = await extractRecordInfo(utterance, facilityList);
    const timestamp = new Date();
    const patientMap: Record<string, string> = {};

    for (const ev of events) {
      const pid = generatePid(ev.patientName);
      if (ev.patientName && ev.patientName !== "不明" && ev.patientName !== "解析失敗") {
        patientMap[pid] = ev.patientName;
        await prisma.pidMaster.upsert({
          where: { pid },
          create: { pid, patientName: ev.patientName },
          update: {},
        });
      }

      await prisma.record.create({
        data: {
          timestamp,
          staffId: user.id,
          staffName: user.staffName,
          jobType: user.jobType,
          workplace: user.workplace,
          facilityName: ev.facilityName,
          maskedUtterance: maskUtterance(utterance, ev.patientName),
          patientId: pid,
          eventType: ev.eventType,
        },
      });
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

    const timeStr = formatTimeLocal(timestamp);
    const rowsForClient = events.map((ev) => [
      timeStr,
      user!.staffName,
      user!.jobType,
      user!.workplace,
      ev.facilityName,
      utterance,
      ev.patientName,
      ev.eventType,
    ]);

    await writeLog("データ登録", `${user.staffName}さんが業務を記録`, user.email);

    return NextResponse.json({
      success: true,
      message: `${user.staffName}さんの業務記録を処理しました`,
      data: rowsForClient,
      summary: summary.map(summaryToArray),
      patientMap,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
