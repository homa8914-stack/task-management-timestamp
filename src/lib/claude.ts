export type ParsedEvent = {
  patientName: string;
  eventType: string;
  facilityName: string;
};

export type StaffInfo = {
  staffName: string;
  jobType: string;
  workplace: string;
};

async function callClaude(prompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY が設定されていません");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const result = await response.json();
  if (!result.content?.[0]?.text) return null;
  return result.content[0].text.trim();
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
    if (!raw) return fallback;
    return extractJson<StaffInfo>(raw, "{") || fallback;
  } catch {
    return fallback;
  }
}

export async function extractRecordInfo(
  utterance: string,
  facilityList: string[]
): Promise<ParsedEvent[]> {
  const fail = [{ patientName: "解析失敗", eventType: "解析失敗", facilityName: "解析失敗" }];

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

  try {
    const raw = await callClaude(prompt, 512);
    if (!raw) return fail;

    const parsed = extractJson<ParsedEvent[]>(raw, "[");
    if (!Array.isArray(parsed)) return fail;

    return parsed.map((ev) => ({
      patientName: ev.patientName || "不明",
      eventType: ev.eventType || "不明",
      facilityName: ev.facilityName || "不明",
    }));
  } catch {
    return fail;
  }
}
