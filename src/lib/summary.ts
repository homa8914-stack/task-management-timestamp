import { isValidPid } from "./hash";
import {
  FACILITY_TASK_PAIRS,
  FACILITY_WORK_PID,
  isWorkStartEvent,
  PATIENT_TASK_PAIRS,
  TASK_PAIRS,
} from "./events";

export type RecordEvent = {
  time: Date;
  facility: string;
  pid: string;
  eventType: string;
};

export type SummaryRow = {
  date: string;
  staffName: string;
  jobType: string;
  workplace: string;
  patientId: string;
  facilityName: string;
  summary: string;
  travelTime: number | "";
  prepTime: number | "";
  workTime: number | "";
  totalTime: number | "";
};

export type FacilitySummaryRow = {
  date: string;
  staffName: string;
  jobType: string;
  workplace: string;
  facilityName: string;
  patientCount: number;
  visitCount: number;
  travelTime: number | "";
  prepTime: number | "";
  workTime: number | "";
  totalTime: number | "";
};

export function buildDailySummaries(
  records: RecordEvent[],
  staffName: string,
  jobType: string,
  workplace: string,
  today: string
): { patientSummary: SummaryRow[]; facilitySummary: FacilitySummaryRow[] } {
  const patientSummary = [
    ...calcSummaryDeterministic(records, staffName, jobType, workplace, today),
    ...calcFacilityTaskSummary(records, staffName, jobType, workplace, today),
  ];
  const facilitySummary = calcFacilitySummary(patientSummary, records, staffName, jobType, workplace, today);
  return { patientSummary, facilitySummary };
}

export function calcSummaryDeterministic(
  records: RecordEvent[],
  staffName: string,
  jobType: string,
  workplace: string,
  today: string
): SummaryRow[] {
  const events = [...records].sort((a, b) => a.time.getTime() - b.time.getTime());
  const patientPids = [...new Set(events.filter((e) => isValidPid(e.pid)).map((e) => e.pid))];
  const arriveTravelAssigned = new Set<string>();
  const results: SummaryRow[] = [];

  for (const pid of patientPids) {
    const patientEvents = events.filter((e) => e.pid === pid);

    let workTime: number | null = null;
    const completedLabels: string[] = [];
    let workMinutes = 0;
    let hasWorkPair = false;

    for (const pair of PATIENT_TASK_PAIRS) {
      const duration = pairTaskDuration(patientEvents, pair.start, pair.end);
      if (duration !== null) {
        workMinutes += duration;
        hasWorkPair = true;
        completedLabels.push(pair.label);
      }
    }
    if (hasWorkPair) workTime = workMinutes;

    const startEvents = patientEvents.filter((e) => isWorkStartEvent(e.eventType));
    const startEv = startEvents.length
      ? startEvents.sort((a, b) => a.time.getTime() - b.time.getTime())[0]
      : null;
    const endEv = findLastMatchingEnd(patientEvents, startEv);

    const facility = startEv ? startEv.facility : patientEvents[0]?.facility || "不明";

    let arriveEv: RecordEvent | null = null;
    if (startEv && facility !== "不明") {
      const arrivals = events.filter(
        (e) =>
          e.eventType === "到着" &&
          e.facility === facility &&
          e.time.getTime() <= startEv.time.getTime()
      );
      arriveEv = arrivals.length ? arrivals[arrivals.length - 1] : null;
    }

    let prepTime: number | null = null;
    if (arriveEv && startEv) {
      prepTime = minutesBetween(arriveEv.time, startEv.time);
    }

    let travelTime: number | null = null;
    if (arriveEv && startEv) {
      const arriveKey = `${arriveEv.time.getTime()}|${arriveEv.facility}`;
      if (!arriveTravelAssigned.has(arriveKey)) {
        const arriveIdx = events.findIndex(
          (e) =>
            e.eventType === "到着" &&
            e.facility === arriveEv!.facility &&
            e.time.getTime() === arriveEv!.time.getTime()
        );
        if (arriveIdx > 0) {
          const prev = events[arriveIdx - 1];
          if (prev.eventType === "出発" || prev.eventType === "終了") {
            travelTime = minutesBetween(prev.time, arriveEv.time);
          }
        }
        arriveTravelAssigned.add(arriveKey);
      } else {
        travelTime = 0;
      }
    }

    const summary = buildPatientSummary(patientEvents, facility, completedLabels, startEv, endEv);
    const totalTime = sumMinutes([travelTime, prepTime, workTime]);

    results.push({
      date: today,
      staffName,
      jobType,
      workplace,
      patientId: pid,
      facilityName: facility,
      summary,
      travelTime: toCell(travelTime),
      prepTime: toCell(prepTime),
      workTime: toCell(workTime),
      totalTime: toCell(totalTime),
    });
  }

  return results;
}

/** 施設名だけで記録する業務（カルテ記載など） */
function calcFacilityTaskSummary(
  records: RecordEvent[],
  staffName: string,
  jobType: string,
  workplace: string,
  today: string
): SummaryRow[] {
  const events = [...records].sort((a, b) => a.time.getTime() - b.time.getTime());
  const facilities = [
    ...new Set(
      events
        .filter((e) => isFacilityTaskEvent(e.eventType) && e.facility && e.facility !== "不明")
        .map((e) => e.facility)
    ),
  ];

  const results: SummaryRow[] = [];

  for (const facility of facilities) {
    const facilityEvents = events.filter((e) => e.facility === facility && isFacilityTaskEvent(e.eventType));

    let workMinutes = 0;
    const completedLabels: string[] = [];

    for (const pair of FACILITY_TASK_PAIRS) {
      const duration = pairTaskDuration(facilityEvents, pair.start, pair.end);
      if (duration !== null) {
        workMinutes += duration;
        completedLabels.push(pair.label);
      }
    }

    if (!completedLabels.length && !facilityEvents.length) continue;

    const startEvents = facilityEvents.filter((e) => isWorkStartEvent(e.eventType));
    const startEv = startEvents.length
      ? startEvents.sort((a, b) => a.time.getTime() - b.time.getTime())[0]
      : null;
    const endEv = findLastMatchingEnd(facilityEvents, startEv);

    const summary = buildPatientSummary(
      facilityEvents,
      facility,
      completedLabels,
      startEv,
      endEv
    );

    results.push({
      date: today,
      staffName,
      jobType,
      workplace,
      patientId: FACILITY_WORK_PID,
      facilityName: facility,
      summary,
      travelTime: "",
      prepTime: "",
      workTime: workMinutes > 0 ? workMinutes : "",
      totalTime: workMinutes > 0 ? workMinutes : "",
    });
  }

  return results;
}

function isFacilityTaskEvent(eventType: string): boolean {
  return FACILITY_TASK_PAIRS.some((p) => p.start === eventType || p.end === eventType);
}

/** 患者別集計を施設ごとに合算 */
export function calcFacilitySummary(
  patientRows: SummaryRow[],
  records: RecordEvent[],
  staffName: string,
  jobType: string,
  workplace: string,
  today: string
): FacilitySummaryRow[] {
  const events = [...records].sort((a, b) => a.time.getTime() - b.time.getTime());
  const byFacility = new Map<string, SummaryRow[]>();

  for (const row of patientRows) {
    const f = row.facilityName;
    if (!f || f === "不明" || f === "解析失敗") continue;
    if (!byFacility.has(f)) byFacility.set(f, []);
    byFacility.get(f)!.push(row);
  }

  for (const e of events) {
    if (!e.facility || e.facility === "不明" || e.facility === "解析失敗") continue;
    if (isFacilityTaskEvent(e.eventType) && !byFacility.has(e.facility)) {
      byFacility.set(e.facility, []);
    }
  }

  const results: FacilitySummaryRow[] = [];

  for (const [facilityName, rows] of byFacility.entries()) {
    const visitCount = events.filter(
      (e) => e.facility === facilityName && e.eventType === "到着"
    ).length;

    const travelTime = sumCells(rows.map((r) => r.travelTime));
    const prepTime = sumCells(rows.map((r) => r.prepTime));
    const workTime = sumCells(rows.map((r) => r.workTime));
    const totalTime = sumCells(rows.map((r) => r.totalTime));

    results.push({
      date: today,
      staffName,
      jobType,
      workplace,
      facilityName,
      patientCount: rows.filter((r) => r.patientId !== FACILITY_WORK_PID && isValidPid(r.patientId)).length,
      visitCount: visitCount || 1,
      travelTime,
      prepTime,
      workTime,
      totalTime,
    });
  }

  return results.sort((a, b) => String(a.facilityName).localeCompare(String(b.facilityName), "ja"));
}

function sumCells(values: (number | "")[]): number | "" {
  const nums = values.filter((v): v is number => v !== "" && !isNaN(v));
  if (nums.length === 0) return "";
  return nums.reduce((a, b) => a + b, 0);
}

function pairTaskDuration(
  patientEvents: RecordEvent[],
  startType: string,
  endType: string
): number | null {
  const starts = patientEvents.filter((e) => e.eventType === startType);
  const ends = patientEvents.filter((e) => e.eventType === endType);
  if (!starts.length || !ends.length) return null;

  const startEv = starts[starts.length - 1];
  let endEv = ends[ends.length - 1];
  if (endEv.time < startEv.time) {
    endEv = ends.find((e) => e.time >= startEv.time) || endEv;
  }
  if (endEv.time < startEv.time) return null;
  return minutesBetween(startEv.time, endEv.time);
}

function findLastMatchingEnd(
  patientEvents: RecordEvent[],
  startEv: RecordEvent | null
): RecordEvent | null {
  if (!startEv) return null;
  const pair = TASK_PAIRS.find((p) => p.start === startEv.eventType);
  if (!pair) return null;
  const ends = patientEvents.filter((e) => e.eventType === pair.end);
  if (!ends.length) return null;
  let endEv = ends[ends.length - 1];
  if (endEv.time < startEv.time) {
    endEv = ends.find((e) => e.time >= startEv.time) || endEv;
  }
  return endEv.time >= startEv.time ? endEv : null;
}

function buildPatientSummary(
  patientEvents: RecordEvent[],
  facility: string,
  completedLabels: string[],
  startEv: RecordEvent | null,
  endEv: RecordEvent | null
): string {
  const parts: string[] = [];
  if (facility && facility !== "不明") parts.push(facility);
  if (completedLabels.length) {
    parts.push(completedLabels.join("・") + "完了");
  } else if (startEv && endEv) {
    parts.push("作業完了");
  } else if (startEv) {
    parts.push("作業中");
  } else {
    const types = [...new Set(patientEvents.map((e) => e.eventType))];
    parts.push(types.join("・") || "記録あり");
  }
  return parts.join("｜");
}

function minutesBetween(from: Date, to: Date): number | null {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}

function sumMinutes(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0);
}

function toCell(value: number | null): number | "" {
  if (value === null || isNaN(value)) return "";
  return value;
}

export function summaryToArray(row: SummaryRow): (string | number)[] {
  return [
    row.date,
    row.staffName,
    row.jobType,
    row.workplace,
    row.patientId,
    row.summary,
    row.travelTime,
    row.prepTime,
    row.workTime,
    row.totalTime,
  ];
}

export function facilitySummaryToArray(row: FacilitySummaryRow): (string | number)[] {
  return [
    row.date,
    row.staffName,
    row.jobType,
    row.workplace,
    row.facilityName,
    row.patientCount,
    row.visitCount,
    row.travelTime,
    row.prepTime,
    row.workTime,
    row.totalTime,
  ];
}
