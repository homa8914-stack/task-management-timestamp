// Google Apps Script - 訪問診療記録システム v7 (集計ロジック修正版)
// 変更点:
//   - AI集計 → イベント時刻の差分計算に置き換え
//   - 集計対象をスタッフ本人の記録のみに限定
//   - 集計シートを全消去せず、該当スタッフの当日分のみ更新

const MASTER_SHEET_NAME = 'マスタ';
const RECORD_SHEET_NAME = '記録';
const FACILITY_MASTER_SHEET_NAME = '施設マスタ';
const PID_MASTER_SHEET_NAME = 'PIDマスタ';
const HEADERS = ['記録日時', 'スタッフ名', '職種', '勤務場所', '対象施設', '発話内容(マスク済)', '患者ID(匿名)', 'イベント種別'];

function doGet(e) {
  writeLog("ログイン", "アプリを起動しました");
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('業務記録システム｜菊南病院')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function checkLoginStatus() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return { success: true, isRegistered: false, reason: "email_blank" };

    const user = getUserInfoByEmail(email);
    if (user) {
      return { success: true, isRegistered: true, user: user };
    } else {
      return { success: true, isRegistered: false, email: email };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { type, utterance } = data;

    if (!type || !utterance) return jsonResponse({ success: false, error: '引数が不足しています' }, 400);

    if (type === 'setup') return handleSetup(utterance);
    if (type === 'record') return handleRecord(utterance);
    return jsonResponse({ success: false, error: '不正なタイプです' }, 400);
  } catch (err) {
    writeLog("システムエラー(doPost)", err.message);
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

function handleSetupFromClient(utterance) {
  const result = handleSetup(utterance);
  return JSON.parse(result.getContent());
}

function handleRecordFromClient(utterance, cachedUser) {
  let email = Session.getActiveUser().getEmail();
  let user = getUserInfoByEmail(email) || cachedUser;

  if (!user) return { success: false, error: 'ユーザー設定がされていません。' };

  const { staffName, jobType, workplace } = user;
  const facilityList = getFacilityMasterList();

  const events = extractRecordInfo(utterance, facilityList);

  const timestamp = new Date();
  let patientMap = {};

  const rowsForSheet = events.map(ev => {
    let maskedUtterance = utterance;
    if (ev.patientName && ev.patientName !== '不明' && ev.patientName !== '解析失敗') {
      maskedUtterance = maskedUtterance.split(ev.patientName).join('〇〇');
    }
    const patientHash = generateHash(ev.patientName);

    if (ev.patientName && ev.patientName !== '不明' && ev.patientName !== '解析失敗') {
      patientMap[patientHash] = ev.patientName;
    }

    return {
      hash: patientHash,
      rawName: ev.patientName,
      row: [timestamp, staffName, jobType, workplace, ev.facilityName, maskedUtterance, patientHash, ev.eventType]
    };
  });

  let summary = null;
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = `${jobType}_${workplace}`;
    ensureRoleSheet(ss, sheetName);

    rowsForSheet.forEach(item => {
      registerToPidMaster(item.hash, item.rawName, ss);
      appendToSheet(ss, RECORD_SHEET_NAME, item.row);
      appendToSheet(ss, sheetName, item.row);
    });

    summary = updateSummary(ss, staffName, jobType, workplace);

  } catch (err) {
    if (err.message.includes('lock') || err.message.includes('タイムアウト')) {
      writeLog("同時アクセス保護", "他スタッフとの書き込み衝突を回避しました。");
      return { success: false, error: '現在システムが混み合っています。数秒待ってからもう一度お試しください。' };
    }
    writeLog("書き込みエラー", err.message);
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }

  const timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm');
  const rowsForClient = events.map(ev => [timeStr, staffName, jobType, workplace, ev.facilityName, utterance, ev.patientName, ev.eventType]);

  writeLog("データ登録", `${staffName}さんが業務を記録（ロック処理による安全書き込み完了）`);

  return {
    success: true,
    message: `${staffName}さんの業務記録を処理しました`,
    data: rowsForClient,
    summary: summary,
    patientMap: patientMap
  };
}

function generateHash(text) {
  if (!text || text === '不明' || text === '解析失敗') return text;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  let hash = '';
  for (let i = 0; i < digest.length; i++) {
    let byteStr = (digest[i] & 0xFF).toString(16);
    if (byteStr.length === 1) byteStr = '0' + byteStr;
    hash += byteStr;
  }
  return "PID_" + hash.substring(0, 12).toUpperCase();
}

function handleSetup(utterance) {
  const extracted = extractUserInfo(utterance);
  const email = Session.getActiveUser().getEmail();

  if (!extracted.staffName || !extracted.jobType || !extracted.workplace) {
    return jsonResponse({ success: false, error: 'スタッフ情報を聞き取れませんでした。' }, 400);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    registerToMaster(extracted, email || "local_user");
  } catch (err) {
    return jsonResponse({ success: false, error: '混雑しています。もう一度お試しください。' }, 500);
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ success: true, message: `${extracted.staffName}さんとしてセットしました`, user: extracted }, 200);
}

function getFacilityMasterList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(FACILITY_MASTER_SHEET_NAME);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(row => String(row[0]).trim()).filter(Boolean);
}

function registerToPidMaster(pid, patientName, ss) {
  if (!pid || !patientName || pid === '不明' || pid === '解析失敗') return;
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PID_MASTER_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PID_MASTER_SHEET_NAME);
    sheet.appendRow(['患者ID(匿名)', '患者名']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === pid) return;
  }
  sheet.appendRow([pid, patientName]);
}

// ============================================================
// 集計（v7: 決定論的計算 + スタッフ別フィルタ）
// ============================================================

function updateSummary(ss, staffName, jobType, workplace) {
  const SUMMARY_SHEET_NAME = '集計';
  const SUMMARY_HEADERS = ['日付', 'スタッフ名', '職種', '勤務場所', '患者ID(匿名)', '業務内容の要約', '移動時間（分）', '準備時間（分）', '業務時間（分）', '合計時間（分）'];

  const recordSheet = ss.getSheetByName(RECORD_SHEET_NAME);
  if (!recordSheet) return null;

  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const allData = recordSheet.getDataRange().getValues();

  // ★修正: 日付 + スタッフ本人の記録のみに限定
  const todayRecords = allData.filter((row, i) => {
    if (i === 0 || !row[0]) return false;
    if (row[1] !== staffName || row[2] !== jobType || row[3] !== workplace) return false;
    try {
      const cellDate = row[0] instanceof Date ? row[0] : new Date(row[0]);
      const rowDateStr = Utilities.formatDate(cellDate, tz, 'yyyy-MM-dd');
      return rowDateStr === todayStr;
    } catch (e) {
      return false;
    }
  });

  if (todayRecords.length === 0) return null;

  // ★修正: AIではなく時刻差分で計算
  const summaryRows = calcSummaryDeterministic(todayRecords, staffName, jobType, workplace);

  let summarySheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!summarySheet) {
    summarySheet = ss.insertSheet(SUMMARY_SHEET_NAME);
    summarySheet.appendRow(SUMMARY_HEADERS);
    summarySheet.getRange(1, 1, 1, SUMMARY_HEADERS.length).setFontWeight('bold');
  }

  // ★修正: 全消去せず、該当スタッフの当日分だけ差し替え
  const existingData = summarySheet.getDataRange().getValues();
  const header = existingData.length > 0 ? existingData[0] : SUMMARY_HEADERS;
  const keptRows = [];

  for (let i = 1; i < existingData.length; i++) {
    const row = existingData[i];
    const rowDateStr = formatRowDate(row[0], tz);
    const isTarget =
      rowDateStr === todayStr &&
      row[1] === staffName &&
      row[2] === jobType &&
      row[3] === workplace;
    if (!isTarget) keptRows.push(row);
  }

  summarySheet.clearContents();
  summarySheet.appendRow(header);
  summarySheet.getRange(1, 1, 1, SUMMARY_HEADERS.length).setFontWeight('bold');
  keptRows.forEach(row => summarySheet.appendRow(row));
  summaryRows.forEach(row => summarySheet.appendRow(row));

  return summaryRows;
}

/**
 * イベント時刻の差分から患者別の時間を計算する。
 *
 * 時間の定義:
 *   移動 = 到着の直前イベント(出発/終了) → 到着  ※施設到着時の最初の患者のみ
 *   準備 = 到着 → 開始
 *   診療 = 開始 → 終了
 *   合計 = 移動 + 準備 + 診療
 */
function calcSummaryDeterministic(records, staffName, jobType, workplace) {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const events = records
    .map(r => ({
      time: parseRecordDate(r[0]),
      facility: String(r[4] || '不明').trim(),
      pid: String(r[6] || '').trim(),
      eventType: String(r[7] || '').trim()
    }))
    .filter(e => e.time)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const patientPids = [...new Set(
    events.filter(e => isValidPid(e.pid)).map(e => e.pid)
  )];

  const arriveTravelAssigned = new Set();
  const results = [];

  for (const pid of patientPids) {
    const patientEvents = events.filter(e => e.pid === pid);
    const starts = patientEvents.filter(e => e.eventType === '開始');
    const ends = patientEvents.filter(e => e.eventType === '終了');

    const startEv = starts.length ? starts[starts.length - 1] : null;
    let endEv = ends.length ? ends[ends.length - 1] : null;

    if (startEv && endEv && endEv.time < startEv.time) {
      endEv = ends.find(e => e.time >= startEv.time) || null;
    }

    const facility = startEv ? startEv.facility : (patientEvents[0]?.facility || '不明');

    let workTime = null;
    if (startEv && endEv) {
      workTime = minutesBetween(startEv.time, endEv.time);
    }

    let arriveEv = null;
    if (startEv && facility !== '不明') {
      const arrivals = events.filter(e =>
        e.eventType === '到着' &&
        e.facility === facility &&
        e.time.getTime() <= startEv.time.getTime()
      );
      arriveEv = arrivals.length ? arrivals[arrivals.length - 1] : null;
    }

    let prepTime = null;
    if (arriveEv && startEv) {
      prepTime = minutesBetween(arriveEv.time, startEv.time);
    }

    let travelTime = null;
    if (arriveEv && startEv) {
      const arriveKey = arriveEv.time.getTime() + '|' + arriveEv.facility;
      if (!arriveTravelAssigned.has(arriveKey)) {
        const arriveIdx = events.findIndex(e =>
          e.eventType === '到着' &&
          e.facility === arriveEv.facility &&
          e.time.getTime() === arriveEv.time.getTime()
        );
        if (arriveIdx > 0) {
          const prev = events[arriveIdx - 1];
          if (prev.eventType === '出発' || prev.eventType === '終了') {
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

    results.push([
      today,
      staffName,
      jobType,
      workplace,
      pid,
      summary,
      toMinuteCell(travelTime),
      toMinuteCell(prepTime),
      toMinuteCell(workTime),
      toMinuteCell(totalTime)
    ]);
  }

  return results;
}

function buildPatientSummary(patientEvents, facility, startEv, endEv) {
  const parts = [];
  if (facility && facility !== '不明') parts.push(facility);
  if (startEv && endEv) {
    parts.push('診療完了');
  } else if (startEv) {
    parts.push('診療中');
  } else {
    const types = [...new Set(patientEvents.map(e => e.eventType))];
    parts.push(types.join('・') || '記録あり');
  }
  return parts.join('｜');
}

function isValidPid(pid) {
  return pid && pid !== '不明' && pid !== '解析失敗' && pid.startsWith('PID_');
}

function parseRecordDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatRowDate(value, tz) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  } catch (e) {
    return String(value || '');
  }
}

function minutesBetween(from, to) {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}

function sumMinutes(values) {
  const valid = values.filter(v => v !== null && v !== '' && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0);
}

function toMinuteCell(value) {
  if (value === null || value === '' || isNaN(value)) return '';
  return value;
}

// ============================================================
// AI解析（記録・設定の自然言語処理 — 集計には使わない）
// ============================================================

function extractUserInfo(utterance) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY が設定されていません');

  const prompt = `以下の発話内容から「スタッフ名」「職種」「勤務場所」を抽出してJSON形式のみで回答してください。\n発話内容: ${utterance}\n返却形式: {"staffName": "名前", "jobType": "職種", "workplace": "場所"}`;

  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (!result.content || !result.content[0]) return { staffName: null, jobType: null, workplace: null };

    let rawText = result.content[0].text.trim();
    const startIdx = rawText.indexOf('{');
    const endIdx = rawText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      rawText = rawText.substring(startIdx, endIdx + 1);
    } else {
      return { staffName: null, jobType: null, workplace: null };
    }

    return JSON.parse(rawText);
  } catch (err) {
    return { staffName: null, jobType: null, workplace: null };
  }
}

function extractRecordInfo(utterance, facilityList) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY が設定されていません');

  const facilityInstruction = facilityList.length > 0
    ? `【重要】「facilityName」は、必ず以下の【施設リスト】の中から、発話内容に最も関係が深いと思われるものを「完全一致」で1つ選んでください。略称や言い換えもリストにある名称へ厳格にマッピングしてください。リストに類似するものが全く該当しない場合のみ「不明」としてください。\n\n【施設リスト】\n${facilityList.join('\n')}`
    : `「facilityName」には、発話内容から施設名や場所が読み取れる場合はそれを抽出し、無ければ「不明」としてください。`;

  const prompt = `以下の発話内容に含まれる業務イベントをすべて抽出し、指定のJSON配列形式のみで返してください。\nイベント種別は「出発」「到着」「開始」「終了」「不明」のいずれか。\n\n${facilityInstruction}\n\n発話内容: ${utterance}\n\n返却形式:\n[{"patientName": "患者名", "eventType": "イベント種別", "facilityName": "施設名"}]`;

  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (!result.content || !result.content[0]) return [{ patientName: '解析失敗', eventType: '解析失敗', facilityName: '解析失敗' }];

    let rawText = result.content[0].text.trim();
    const startIdx = rawText.indexOf('[');
    const endIdx = rawText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      rawText = rawText.substring(startIdx, endIdx + 1);
    } else {
      return [{ patientName: '解析失敗', eventType: '解析失敗', facilityName: '解析失敗' }];
    }

    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed) ? parsed.map(ev => ({
      patientName: ev.patientName || '不明',
      eventType: ev.eventType || '不明',
      facilityName: ev.facilityName || '不明'
    })) : [{ patientName: '解析失敗', eventType: '解析失敗', facilityName: '解析失敗' }];
  } catch (err) {
    writeLog("AI解析通信例外", err.message);
    return [{ patientName: '解析失敗', eventType: '解析失敗', facilityName: '解析失敗' }];
  }
}

// ============================================================
// ユーティリティ
// ============================================================

function registerToMaster(user, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_SHEET_NAME);
    sheet.appendRow(['メールアドレス', 'スタッフ名', '職種', '勤務場所']);
  }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === email.toLowerCase().trim() && email !== "local_user") {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[user.staffName, user.jobType, user.workplace]]);
      return;
    }
  }
  sheet.appendRow([email, user.staffName, user.jobType, user.workplace]);
}

function getUserInfoByEmail(email) {
  if (!email) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === email.toLowerCase().trim()) {
      return { staffName: data[i][1], jobType: data[i][2], workplace: data[i][3] };
    }
  }
  return null;
}

function ensureRoleSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function appendToSheet(ss, sheetName, row) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  sheet.appendRow(row);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function writeLog(action, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('アクセスログ');
    if (!logSheet) {
      logSheet = ss.insertSheet('アクセスログ');
      logSheet.appendRow(['タイムスタンプ', '実行ユーザー(Email)', 'アクション', '詳細']);
      logSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#f3f3f3");
      logSheet.setFrozenRows(1);
    }
    const timestamp = new Date();
    const userEmail = Session.getActiveUser().getEmail();
    logSheet.appendRow([timestamp, userEmail || "非開示(ローカル環境)", action, details]);
  } catch (e) {
    console.error("Log error:", e);
  }
}
