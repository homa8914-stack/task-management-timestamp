import { isValidPid } from "./hash";

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
  summary: string;
  travelTime: number | "";
  prepTime: number | "";
  workTime: number | "";
  totalTime: number | "";
};

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
    const starts = patientEvents.filter((e) => e.eventType === "開始");
    const ends = patientEvents.filter((e) => e.eventType === "終了");

    const startEv = starts.length ? starts[starts.length - 1] : null;
    let endEv = ends.length ? ends[ends.length - 1] : null;

    if (startEv && endEv && endEv.time < startEv.time) {
      endEv = ends.find((e) => e.time >= startEv.time) || null;
    }

    const facility = startEv ? startEv.facility : patientEvents[0]?.facility || "不明";

    let workTime: number | null = null;
    if (startEv && endEv) {
      workTime = minutesBetween(startEv.time, endEv.time);
    }

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

    const summary = buildPatientSummary(patientEvents, facility, startEv, endEv);
    const totalTime = sumMinutes([travelTime, prepTime, workTime]);

    results.push({
      date: today,
      staffName,
      jobType,
      workplace,
      patientId: pid,
      summary,
      travelTime: toCell(travelTime),
      prepTime: toCell(prepTime),
      workTime: toCell(workTime),
      totalTime: toCell(totalTime),
    });
  }

  return results;
}

function buildPatientSummary(
  patientEvents: RecordEvent[],
  facility: string,
  startEv: RecordEvent | null,
  endEv: RecordEvent | null
): string {
  const parts: string[] = [];
  if (facility && facility !== "不明") parts.push(facility);
  if (startEv && endEv) {
    parts.push("診療完了");
  } else if (startEv) {
    parts.push("診療中");
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
