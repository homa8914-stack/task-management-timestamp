import { loadEnvConfig } from "@next/env";
import { google } from "googleapis";
import type { FacilitySummaryRow, SummaryRow } from "./summary";

let envLoaded = false;

function ensureEnvLoaded() {
  if (!envLoaded) {
    loadEnvConfig(process.cwd());
    envLoaded = true;
  }
}

function env(key: string): string {
  ensureEnvLoaded();
  return process.env[key]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

const RECORD_HEADERS = [
  "記録日時",
  "スタッフ名",
  "職種",
  "勤務場所",
  "対象施設",
  "発話内容(マスク済)",
  "患者ID(匿名)",
  "イベント種別",
];

const PATIENT_SUMMARY_HEADERS = [
  "日付",
  "スタッフ名",
  "職種",
  "勤務場所",
  "患者ID(匿名)",
  "対象施設",
  "移動時間（分）",
  "準備時間（分）",
  "業務時間（分）",
  "合計時間（分）",
];

const FACILITY_SUMMARY_HEADERS = [
  "日付",
  "スタッフ名",
  "職種",
  "勤務場所",
  "対象施設",
  "患者数",
  "移動時間（分）",
  "準備時間（分）",
  "業務時間（分）",
  "合計時間（分）",
];

export type SheetRecordRow = {
  timestamp: Date;
  staffName: string;
  jobType: string;
  workplace: string;
  facilityName: string;
  maskedUtterance: string;
  patientId: string;
  eventType: string;
};

function getSpreadsheetId(): string {
  const id = env("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID が未設定です");
  return id;
}

export function isSheetsConfigured(): boolean {
  ensureEnvLoaded();
  return Boolean(
    env("GOOGLE_SHEETS_SPREADSHEET_ID") &&
      env("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
      env("GOOGLE_PRIVATE_KEY")
  );
}

/** デバッグ用：どの変数が欠けているか（値は返さない） */
export function getSheetsConfigStatus(): {
  spreadsheetId: boolean;
  serviceAccountEmail: boolean;
  privateKey: boolean;
} {
  ensureEnvLoaded();
  return {
    spreadsheetId: Boolean(env("GOOGLE_SHEETS_SPREADSHEET_ID")),
    serviceAccountEmail: Boolean(env("GOOGLE_SERVICE_ACCOUNT_EMAIL")),
    privateKey: Boolean(env("GOOGLE_PRIVATE_KEY")),
  };
}

function getAuthClient() {
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Google サービスアカウントの認証情報が未設定です");
  }
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsApi() {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}

function sheetTab(
  kind:
    | "RECORD"
    | "PATIENT_SUMMARY"
    | "FACILITY_SUMMARY"
    | "PATIENT_HISTORY"
    | "FACILITY_HISTORY"
): string {
  ensureEnvLoaded();
  const envMap = {
    RECORD: process.env.GOOGLE_SHEETS_RECORD_TAB,
    PATIENT_SUMMARY: process.env.GOOGLE_SHEETS_PATIENT_SUMMARY_TAB,
    FACILITY_SUMMARY: process.env.GOOGLE_SHEETS_FACILITY_SUMMARY_TAB,
    PATIENT_HISTORY: process.env.GOOGLE_SHEETS_PATIENT_HISTORY_TAB,
    FACILITY_HISTORY: process.env.GOOGLE_SHEETS_FACILITY_HISTORY_TAB,
  };
  const defaults = {
    RECORD: "記録",
    PATIENT_SUMMARY: "集計_患者",
    FACILITY_SUMMARY: "集計_施設",
    PATIENT_HISTORY: "患者別_履歴",
    FACILITY_HISTORY: "施設別_履歴",
  };
  return envMap[kind]?.trim() || defaults[kind];
}

async function ensureSheetWithHeaders(
  sheets: ReturnType<typeof getSheetsApi>,
  spreadsheetId: string,
  tabName: string,
  headers: string[]
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties
    ?.sheetId;

  if (sheetId === undefined) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
  }

  const range = `${tabName}!A1:${columnLetter(headers.length)}1`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = existing.data.values?.[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }

  return sheetId;
}

function columnLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function formatSheetDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toSheetCell(value: number | ""): string | number {
  return value === "" ? "" : value;
}

const FACILITY_MASTER_HEADERS = ["施設名"];

function facilityMasterTab(): string {
  ensureEnvLoaded();
  return process.env.GOOGLE_SHEETS_FACILITY_TAB?.trim() || "施設マスタ";
}

function parseSheetDateTime(value: string): Date | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  const normalized = t.includes("T") ? t : t.replace(/-/g, "/");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function assertSheetsConfigured(): void {
  if (!isSheetsConfigured()) {
    throw new Error(
      "Google Sheets が未設定です。Vercel の環境変数（GOOGLE_SHEETS_*）を設定してください。"
    );
  }
}

/** 施設マスタ一覧 */
export async function getFacilityListFromSheet(): Promise<string[]> {
  assertSheetsConfigured();
  const sheets = getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabName = facilityMasterTab();

  await ensureSheetWithHeaders(sheets, spreadsheetId, tabName, FACILITY_MASTER_HEADERS);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:A`,
  });

  const rows = res.data.values ?? [];
  const names = rows
    .slice(1)
    .map((row) => String(row[0] ?? "").trim())
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ja"));
}

/** 施設マスタに1件追加（重複は無視） */
export async function addFacilityToSheet(name: string): Promise<void> {
  assertSheetsConfigured();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("施設名が空です");

  const existing = await getFacilityListFromSheet();
  if (existing.includes(trimmed)) return;

  const sheets = getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabName = facilityMasterTab();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[trimmed]] },
  });
}

export type StoredRecord = {
  timestamp: Date;
  staffName: string;
  jobType: string;
  workplace: string;
  facilityName: string;
  maskedUtterance: string;
  patientId: string;
  eventType: string;
};

/** 記録シートから当日分を読み込み */
export async function readTodayRecordsFromSheet(
  staffName: string,
  jobType: string,
  workplace: string,
  today: string
): Promise<StoredRecord[]> {
  assertSheetsConfigured();
  const sheets = getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabName = sheetTab("RECORD");

  await ensureSheetWithHeaders(sheets, spreadsheetId, tabName, RECORD_HEADERS);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:H`,
  });

  const rows = res.data.values ?? [];
  const results: StoredRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 8) continue;
    if (row[1] !== staffName || row[2] !== jobType || row[3] !== workplace) continue;

    const timestamp = parseSheetDateTime(String(row[0]));
    if (!timestamp) continue;

    const rowDate = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")}`;
    if (rowDate !== today) continue;

    results.push({
      timestamp,
      staffName: String(row[1]),
      jobType: String(row[2]),
      workplace: String(row[3]),
      facilityName: String(row[4] ?? "不明"),
      maskedUtterance: String(row[5] ?? ""),
      patientId: String(row[6] ?? "不明"),
      eventType: String(row[7] ?? "不明"),
    });
  }

  return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/** 記録行を追記（患者名は含めない・PIDのみ） */
export async function appendRecordRowsToSheet(rows: SheetRecordRow[]): Promise<void> {
  if (!rows.length) return;

  const sheets = getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabName = sheetTab("RECORD");

  await ensureSheetWithHeaders(sheets, spreadsheetId, tabName, RECORD_HEADERS);

  const values = rows.map((r) => [
    formatSheetDateTime(r.timestamp),
    r.staffName,
    r.jobType,
    r.workplace,
    r.facilityName,
    r.maskedUtterance,
    r.patientId,
    r.eventType,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/** 当日分の集計シートを差し替え（スタッフ単位・PIDのみ） */
export async function syncDailySummariesToSheet(
  patientRows: SummaryRow[],
  facilityRows: FacilitySummaryRow[],
  today: string
): Promise<void> {
  if (!patientRows.length && !facilityRows.length) return;

  const sheets = getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const patientTab = sheetTab("PATIENT_SUMMARY");
  const facilityTab = sheetTab("FACILITY_SUMMARY");

  const staffKey =
    patientRows[0] ||
    (facilityRows[0]
      ? {
          staffName: facilityRows[0].staffName,
          jobType: facilityRows[0].jobType,
          workplace: facilityRows[0].workplace,
        }
      : null);

  if (!staffKey) return;

  await replaceStaffDailyRows(
    sheets,
    spreadsheetId,
    patientTab,
    PATIENT_SUMMARY_HEADERS,
    today,
    staffKey.staffName,
    staffKey.jobType,
    staffKey.workplace,
    patientRows.map(mapPatientSummaryRow)
  );

  await replaceStaffDailyRows(
    sheets,
    spreadsheetId,
    facilityTab,
    FACILITY_SUMMARY_HEADERS,
    today,
    staffKey.staffName,
    staffKey.jobType,
    staffKey.workplace,
    facilityRows.map(mapFacilitySummaryRow)
  );

  // 履歴シート：当日分だけ差し替え、過去日付の行は残す（数か月分が時系列で蓄積）
  const patientHistoryTab = sheetTab("PATIENT_HISTORY");
  const facilityHistoryTab = sheetTab("FACILITY_HISTORY");

  await replaceStaffDailyRows(
    sheets,
    spreadsheetId,
    patientHistoryTab,
    PATIENT_SUMMARY_HEADERS,
    today,
    staffKey.staffName,
    staffKey.jobType,
    staffKey.workplace,
    patientRows.map(mapPatientSummaryRow)
  );

  await replaceStaffDailyRows(
    sheets,
    spreadsheetId,
    facilityHistoryTab,
    FACILITY_SUMMARY_HEADERS,
    today,
    staffKey.staffName,
    staffKey.jobType,
    staffKey.workplace,
    facilityRows.map(mapFacilitySummaryRow)
  );
}

function mapPatientSummaryRow(r: SummaryRow): (string | number)[] {
  return [
    r.date,
    r.staffName,
    r.jobType,
    r.workplace,
    r.patientId,
    r.facilityName,
    toSheetCell(r.travelTime),
    toSheetCell(r.prepTime),
    toSheetCell(r.workTime),
    toSheetCell(r.totalTime),
  ];
}

function mapFacilitySummaryRow(r: FacilitySummaryRow): (string | number)[] {
  return [
    r.date,
    r.staffName,
    r.jobType,
    r.workplace,
    r.facilityName,
    r.patientCount,
    toSheetCell(r.travelTime),
    toSheetCell(r.prepTime),
    toSheetCell(r.workTime),
    toSheetCell(r.totalTime),
  ];
}

async function replaceStaffDailyRows(
  sheets: ReturnType<typeof getSheetsApi>,
  spreadsheetId: string,
  tabName: string,
  headers: string[],
  today: string,
  staffName: string,
  jobType: string,
  workplace: string,
  newRows: (string | number)[][]
) {
  await ensureSheetWithHeaders(sheets, spreadsheetId, tabName, headers);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });

  const allRows = res.data.values ?? [];
  const header = allRows.length > 0 ? allRows[0] : headers;
  const kept: (string | number)[][] = [];

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    const rowDate = String(row[0] ?? "");
    const isTarget =
      rowDate === today &&
      row[1] === staffName &&
      row[2] === jobType &&
      row[3] === workplace;
    if (!isTarget) kept.push(row);
  }

  const combined = [header, ...kept, ...newRows];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: combined },
  });
}

/** 設定確認用 */
export async function testSheetsConnection(): Promise<{ ok: boolean; title?: string; error?: string }> {
  try {
    if (!isSheetsConfigured()) {
      return { ok: false, error: "環境変数が未設定です" };
    }
    const sheets = getSheetsApi();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
    return { ok: true, title: meta.data.properties?.title ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "接続失敗" };
  }
}
