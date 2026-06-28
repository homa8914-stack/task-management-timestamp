/** 移動系（患者選択不要） */
export const MOVEMENT_EVENT_TYPES = ["出発", "到着"] as const;

/** 業務の開始/終了ペア（すべて施設名＋音声のみ。患者タップ不要） */
export const TASK_PAIRS = [
  { start: "開始", end: "終了", label: "診療" },
  { start: "カルテ記載開始", end: "カルテ記載終了", label: "カルテ記載" },
  { start: "注射開始", end: "注射終了", label: "注射" },
  { start: "点滴開始", end: "点滴終了", label: "点滴" },
  { start: "バイタル開始", end: "バイタル終了", label: "バイタル" },
  { start: "処置開始", end: "処置終了", label: "処置" },
] as const;

/** @deprecated TASK_PAIRS を使用 */
export const FACILITY_TASK_PAIRS = TASK_PAIRS;
/** @deprecated 患者タップは不要 */
export const PATIENT_TASK_PAIRS = [] as const;

/** 施設単位の集計行で使う患者IDプレースホルダ */
export const FACILITY_WORK_PID = "—";

export const ALL_EVENT_TYPES = [
  ...MOVEMENT_EVENT_TYPES,
  ...TASK_PAIRS.flatMap((p) => [p.start, p.end]),
  "不明",
] as const;

export type EventType = (typeof ALL_EVENT_TYPES)[number];

const EVENT_ALIASES: Record<string, EventType> = {
  診療開始: "開始",
  診療終了: "終了",
  診療を始め: "開始",
  診療を始めました: "開始",
  診療開始しました: "開始",
  診療を終了: "終了",
  診療を終了しました: "終了",
  診療終わりました: "終了",
  診療を終わりました: "終了",
  診療終了しました: "終了",
  注射始め: "注射開始",
  注射始めます: "注射開始",
  注射終わり: "注射終了",
  注射終了: "注射終了",
  注射終わりました: "注射終了",
  点滴始め: "点滴開始",
  点滴始めます: "点滴開始",
  点滴終わり: "点滴終了",
  点滴終了: "点滴終了",
  バイタル始め: "バイタル開始",
  バイタル始めます: "バイタル開始",
  バイタル終わり: "バイタル終了",
  バイタル終了: "バイタル終了",
  処置始め: "処置開始",
  処置始めます: "処置開始",
  処置終わり: "処置終了",
  処置終了: "処置終了",
  カルテ始め: "カルテ記載開始",
  カルテ始めます: "カルテ記載開始",
  カルテ記載始め: "カルテ記載開始",
  カルテ記載始めます: "カルテ記載開始",
  カルテ終わり: "カルテ記載終了",
  カルテ終わりました: "カルテ記載終了",
  カルテ記載終了: "カルテ記載終了",
  カルテ終了: "カルテ記載終了",
};

export function normalizeEventType(raw: string): EventType {
  const t = raw.trim();
  if ((ALL_EVENT_TYPES as readonly string[]).includes(t)) {
    return t as EventType;
  }
  if (EVENT_ALIASES[t]) return EVENT_ALIASES[t];
  if (/診療.*(終わ|終了)/.test(t)) return "終了";
  if (/診療.*(始め|開始)/.test(t)) return "開始";
  if (/注射.*(終わ|終了)/.test(t)) return "注射終了";
  if (/注射.*(始め|開始)/.test(t)) return "注射開始";
  if (/点滴.*(終わ|終了)/.test(t)) return "点滴終了";
  if (/点滴.*(始め|開始)/.test(t)) return "点滴開始";
  if (/バイタル.*(終わ|終了)/.test(t)) return "バイタル終了";
  if (/バイタル.*(始め|開始)/.test(t)) return "バイタル開始";
  if (/処置.*(終わ|終了)/.test(t)) return "処置終了";
  if (/処置.*(始め|開始)/.test(t)) return "処置開始";
  return "不明";
}

/** 患者タップは不要（将来の PID 記録用に任意） */
export function requiresPatientSelection(_eventType: string): boolean {
  return false;
}

export function isFacilityOnlyTask(eventType: string): boolean {
  return TASK_PAIRS.some((p) => p.start === eventType || p.end === eventType);
}

export function isWorkStartEvent(eventType: string): boolean {
  return TASK_PAIRS.some((p) => p.start === eventType);
}

export function isWorkEndEvent(eventType: string): boolean {
  return TASK_PAIRS.some((p) => p.end === eventType);
}

export function isNurseJob(jobType: string): boolean {
  return /看護|ナース|NS/i.test(jobType);
}

export function eventTypesForClaudePrompt(): string {
  return ALL_EVENT_TYPES.filter((t) => t !== "不明").join("」「");
}

export function claudeEventMappingHints(): string {
  return `発話とイベント種別の対応例:
- 「カルテ記載始めます」→ カルテ記載開始 / 「カルテ終わりました」→ カルテ記載終了
- 「注射始めます」→ 注射開始 / 「注射終わりました」→ 注射終了
- 「点滴始めます」→ 点滴開始 / 「点滴終わりました」→ 点滴終了
- 「バイタル始めます」→ バイタル開始 / 「バイタル終わりました」→ バイタル終了
- 「処置始めます」→ 処置開始 / 「処置終わりました」→ 処置終了
- 「診療を始めます」→ 開始 / 「◯◯での診療を終わりました」→ 終了
- 「出発しました」→ 出発 / 「到着しました」→ 到着
- 患者名は不要です。施設名と業務種別を抽出してください。`;
}

export function voiceHintExamples(jobType: string): string {
  const base = "例：「3East に到着」「注射始めます」「注射終わりました」";
  if (isNurseJob(jobType)) {
    return `${base}／「点滴始めます」「カルテ記載終わりました」`;
  }
  return "例：「ひまわりに到着」「診療を始めます」「ひまわりでの診療を終わりました」";
}

export function voiceInputPlaceholder(jobType: string): string {
  if (isNurseJob(jobType)) {
    return "例：3East に到着しました。注射始めます。";
  }
  return "例：ひまわりケアセンターに到着しました。診療を始めます。";
}
