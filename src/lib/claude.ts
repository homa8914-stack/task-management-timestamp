import { loadEnvConfig } from "@next/env";
import {
  claudeEventMappingHints,
  detectEventTypesFromUtterance,
  eventTypesForClaudePrompt,
  normalizeEventType,
} from "./events";

let envLoaded = false;

function ensureEnvLoaded() {
  if (!envLoaded) {
    loadEnvConfig(process.cwd());
    envLoaded = true;
  }
}

export type ParsedEvent = {
  eventType: string;
  facilityName: string;
};

/** @deprecated 患者名をAIに送る旧方式。extractEventInfo を使用 */
export type ParsedEventLegacy = {
  patientName: string;
  eventType: string;
  facilityName: string;
};

export type StaffInfo = {
  staffName: string;
  jobType: string;
  workplace: string;
};

function getApiKey(): string {
  ensureEnvLoaded();
  const raw = process.env.CLAUDE_API_KEY?.trim() ?? "";
  const key = raw.replace(/^["']|["']$/g, "");
  if (!key) throw new Error("CLAUDE_API_KEY が設定されていません");
  return key;
}

function getModel(): string {
  ensureEnvLoaded();
  return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = getApiKey();
  const model = getModel();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    const msg =
      result?.error?.message ||
      `HTTP ${response.status}: Claude API への接続に失敗しました`;
    console.error("[Claude API]", msg, { model, status: response.status });
    throw new Error(msg);
  }

  const text = result.content?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Claude API から空の応答が返されました");
  }

  return text;
}

function extractJson<T>(text: string, startChar: "{" | "["): T | null {
  const startIdx = text.indexOf(startChar);
  const endChar = startChar === "{" ? "}" : "]";
  const endIdx = text.lastIndexOf(endChar);
  if (startIdx === -1 || endIdx === -1) return null;
  try {
    return JSON.parse(text.substring(startIdx, endIdx + 1)) as T;
  } catch {
    return null;
  }
}

export async function extractUserInfo(utterance: string): Promise<StaffInfo> {
  const fallback = { staffName: "", jobType: "", workplace: "" };
  const prompt = `以下の発話内容から「スタッフ名」「職種」「勤務場所」を抽出してJSON形式のみで回答してください。
発話内容: ${utterance}
返却形式: {"staffName": "名前", "jobType": "職種", "workplace": "場所"}`;

  try {
    const raw = await callClaude(prompt, 256);
    return extractJson<StaffInfo>(raw, "{") || fallback;
  } catch (err) {
    console.error("[extractUserInfo]", err);
    return fallback;
  }
}

export async function extractEventInfo(
  utterance: string,
  facilityList: string[]
): Promise<ParsedEvent[]> {
  const facilityInstruction =
    facilityList.length > 0
      ? `【重要】「facilityName」は、必ず以下の【施設リスト】の中から、発話内容に最も関係が深いと思われるものを「完全一致」で1つ選んでください。略称や言い換えもリストにある名称へ厳格にマッピングしてください。リストに類似するものが全く該当しない場合のみ「不明」としてください。

【施設リスト】
${facilityList.join("\n")}`
      : `「facilityName」には、発話内容から施設名や場所が読み取れる場合はそれを抽出し、無ければ「不明」としてください。`;

  const prompt = `以下の発話内容に含まれる業務イベントをすべて抽出し、指定のJSON配列形式のみで返してください。
イベント種別は次のいずれかに厳密に合わせてください:「${eventTypesForClaudePrompt()}」「不明」

${claudeEventMappingHints()}

【重要】患者名・人名・イニシャルは抽出しないでください。患者に関するイベントでも patientName フィールドは含めません。

${facilityInstruction}

発話内容: ${utterance}

返却形式:
[{"eventType": "イベント種別", "facilityName": "施設名"}]`;

  // まず発話キーワードから決定論的にイベントを検出（AIに依存しない確実な判定）
  const keywordEvents = detectEventTypesFromUtterance(utterance);

  let aiEvents: ParsedEvent[] = [];
  let aiFacility = "不明";
  try {
    const raw = await callClaude(prompt, 512);
    const parsed = extractJson<ParsedEvent[]>(raw, "[");
    if (Array.isArray(parsed) && parsed.length > 0) {
      aiEvents = parsed.map((ev) => ({
        eventType: normalizeEventType(ev.eventType || "不明"),
        facilityName: ev.facilityName || "不明",
      }));
      const withFacility = aiEvents.find(
        (e) => e.facilityName && e.facilityName !== "不明"
      );
      if (withFacility) aiFacility = withFacility.facilityName;
    }
  } catch (err) {
    // AI が失敗してもキーワード検出があれば記録を続行する
    console.error("[extractEventInfo] AI parse failed:", err);
    if (keywordEvents.length === 0) throw err;
  }

  // キーワードで検出できた場合はそれを優先（施設名は AI の結果を利用）
  if (keywordEvents.length > 0) {
    return keywordEvents.map((eventType) => ({
      eventType,
      facilityName: aiFacility,
    }));
  }

  if (aiEvents.length === 0) {
    throw new Error("発話内容の解析に失敗しました（JSON形式エラー）");
  }

  return aiEvents;
}

/** @deprecated extractEventInfo を使用（患者名をAIに送らない） */
export async function extractRecordInfo(
  utterance: string,
  facilityList: string[]
): Promise<ParsedEventLegacy[]> {
  const facilityInstruction =
    facilityList.length > 0
      ? `【重要】「facilityName」は、必ず以下の【施設リスト】の中から、発話内容に最も関係が深いと思われるものを「完全一致」で1つ選んでください。略称や言い換えもリストにある名称へ厳格にマッピングしてください。リストに類似するものが全く該当しない場合のみ「不明」としてください。

【施設リスト】
${facilityList.join("\n")}`
      : `「facilityName」には、発話内容から施設名や場所が読み取れる場合はそれを抽出し、無ければ「不明」としてください。`;

  const prompt = `以下の発話内容に含まれる業務イベントをすべて抽出し、指定のJSON配列形式のみで返してください。
イベント種別は「出発」「到着」「開始」「終了」「不明」のいずれか。

${facilityInstruction}

発話内容: ${utterance}

返却形式:
[{"patientName": "患者名", "eventType": "イベント種別", "facilityName": "施設名"}]`;

  const raw = await callClaude(prompt, 512);
  const parsed = extractJson<ParsedEventLegacy[]>(raw, "[");

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error("[extractRecordInfo] JSON parse failed:", raw.slice(0, 200));
    throw new Error("発話内容の解析に失敗しました（JSON形式エラー）");
  }

  return parsed.map((ev) => ({
    patientName: ev.patientName || "不明",
    eventType: ev.eventType || "不明",
    facilityName: ev.facilityName || "不明",
  }));
}
