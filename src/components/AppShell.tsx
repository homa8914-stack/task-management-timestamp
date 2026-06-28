"use client";

import { useCallback, useEffect, useState } from "react";
import {
  badgeClass,
  loadPatients,
  loadPatientNames,
  loadUser,
  patientDisplayName,
  savePatients,
  saveUser,
  type LocalPatient,
  type LogEntry,
  type RecordRow,
  type UserInfo,
} from "@/lib/types";
import { generatePidClient } from "@/lib/pid-client";
import { FACILITY_WORK_PID, voiceHintExamples, voiceInputPlaceholder } from "@/lib/events";

type Tab = "setup" | "record" | "summary";
type StatusType = "ok" | "err" | "loading" | "";

function Badge({ event }: { event: string }) {
  return <span className={`badge ${badgeClass(event)}`}>{event}</span>;
}

function MinuteBadge({ value, cls }: { value: string | number; cls: string }) {
  const p = parseFloat(String(value));
  if (isNaN(p)) return <span className="dash">ー</span>;
  return <span className={`badge ${cls}`}>{Math.round(p)}分</span>;
}

export default function AppShell() {
  const [tab, setTab] = useState<Tab>("setup");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [inpName, setInpName] = useState("");
  const [inpJob, setInpJob] = useState("");
  const [inpPlace, setInpPlace] = useState("");
  const [setupStatus, setSetupStatus] = useState({ msg: "", type: "" as StatusType });

  const [utterance, setUtterance] = useState("");
  const [recordStatus, setRecordStatus] = useState({ msg: "", type: "" as StatusType });
  const [resultRows, setResultRows] = useState<RecordRow[] | null>(null);
  const [resultUtterance, setResultUtterance] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summaryData, setSummaryData] = useState<(string | number)[][]>([]);
  const [facilitySummaryData, setFacilitySummaryData] = useState<(string | number)[][]>([]);
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [selectedPatientPid, setSelectedPatientPid] = useState<string | null>(null);
  const [newPatientName, setNewPatientName] = useState("");

  useEffect(() => {
    const stored = loadUser();
    setPatients(loadPatients());
    setPatientNames(loadPatientNames());

    if (stored?.staffName && stored?.jobType && stored?.workplace) {
      setUser(stored);
      setTab("record");
    }
    setLoading(false);
  }, []);

  const refreshSummary = useCallback(async (u: UserInfo) => {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: u }),
    });
    const json = await res.json();
    if (json.success && json.summary) {
      setSummaryData(json.summary);
      setFacilitySummaryData(json.facilitySummary ?? []);
    }
  }, []);

  useEffect(() => {
    if (tab === "summary" && user) {
      refreshSummary(user);
    }
  }, [tab, user, refreshSummary]);

  async function doSetup() {
    if (!inpName.trim() || !inpJob.trim() || !inpPlace.trim()) {
      setSetupStatus({ msg: "全項目を入力してください", type: "err" });
      return;
    }

    setSetupStatus({ msg: "登録中...", type: "loading" });

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffName: inpName.trim(),
        jobType: inpJob.trim(),
        workplace: inpPlace.trim(),
      }),
    });
    const json = await res.json();

    if (json.success) {
      setUser(json.user);
      saveUser(json.user);
      setSetupStatus({ msg: json.message, type: "ok" });
      setTimeout(() => {
        setSetupStatus({ msg: "", type: "" });
        setTab("record");
      }, 700);
    } else {
      setSetupStatus({ msg: json.error || "エラーが発生しました", type: "err" });
    }
  }

  async function addPatient() {
    const name = newPatientName.trim();
    if (!name) return;
    const pid = await generatePidClient(name);
    const next = [...patients.filter((p) => p.pid !== pid), { pid, displayName: name }];
    setPatients(next);
    savePatients(next);
    setPatientNames(Object.fromEntries(next.map((p) => [p.pid, p.displayName])));
    setSelectedPatientPid(pid);
    setNewPatientName("");
  }

  function displayPatient(pidOrName: string): string {
    if (pidOrName === FACILITY_WORK_PID || pidOrName === "不明") {
      return pidOrName === FACILITY_WORK_PID ? "（施設）" : "不明";
    }
    return patientDisplayName(String(pidOrName), patients, patientNames);
  }

  function formatLogPatient(pid: string, facility: string): string {
    if (pid === FACILITY_WORK_PID || pid === "不明" || !pid) {
      return facility && facility !== "不明" ? facility : "（施設）";
    }
    return displayPatient(pid);
  }

  async function doRecord() {
    const text = utterance.trim();
    if (!text || !user) return;

    setRecordStatus({ msg: "記録中...", type: "loading" });

    const res = await fetch("/api/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterance: text,
        user,
        selectedPatientPid,
      }),
    });
    const json = await res.json();

    if (json.success) {
      setRecordStatus({ msg: json.message, type: "ok" });
      setResultRows(json.data);
      setResultUtterance(text);

      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setLogs((prev) => [{ time: t, rows: json.data, utterance: text }, ...prev]);

      if (json.summary) setSummaryData(json.summary);
      if (json.facilitySummary) setFacilitySummaryData(json.facilitySummary);

      setUtterance("");
      setTimeout(() => setRecordStatus({ msg: "", type: "" }), 3000);
    } else {
      setRecordStatus({ msg: json.error || "エラーが発生しました", type: "err" });
    }
  }

  function renderSummary() {
    if (!summaryData.length && !facilitySummaryData.length) {
      return (
        <div className="card">
          <div className="empty-state">
            記録を追加すると
            <br />
            集計が表示されます
          </div>
        </div>
      );
    }

    const valid = summaryData.filter(
      (r) =>
        (r[4] && r[4] !== "不明" && r[4] !== "解析失敗") || r[4] === FACILITY_WORK_PID
    );
    const travels = valid.map((r) => parseFloat(String(r[6]))).filter((v) => !isNaN(v));
    const works = valid.map((r) => parseFloat(String(r[8]))).filter((v) => !isNaN(v));
    const totals = summaryData.map((r) => parseFloat(String(r[9]))).filter((v) => !isNaN(v));

    const totalTime = totals.reduce((a, b) => a + b, 0);
    const avgTravel = travels.length
      ? Math.round(travels.reduce((a, b) => a + b, 0) / travels.length)
      : null;
    const avgWork = works.length
      ? Math.round(works.reduce((a, b) => a + b, 0) / works.length)
      : null;

    const tSum = travels.reduce((a, b) => a + b, 0);
    const wSum = works.reduce((a, b) => a + b, 0);

    const fTravels = facilitySummaryData
      .map((r) => parseFloat(String(r[7])))
      .filter((v) => !isNaN(v));
    const fWorks = facilitySummaryData
      .map((r) => parseFloat(String(r[9])))
      .filter((v) => !isNaN(v));
    const fTotals = facilitySummaryData
      .map((r) => parseFloat(String(r[10])))
      .filter((v) => !isNaN(v));
    const fTotalSum = fTotals.reduce((a, b) => a + b, 0);
    const fTravelSum = fTravels.reduce((a, b) => a + b, 0);
    const fWorkSum = fWorks.reduce((a, b) => a + b, 0);

    return (
      <>
        <div className="card">
          <div className="card-label">今日のサマリー</div>
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">訪問件数</div>
              <div className="metric-val">
                {valid.length}
                <span className="metric-unit">件</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">総稼働時間</div>
              <div className="metric-val">
                {Math.round(totalTime)}
                <span className="metric-unit">分</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">平均移動時間</div>
              <div className="metric-val">
                {avgTravel !== null ? (
                  <>
                    {avgTravel}
                    <span className="metric-unit">分</span>
                  </>
                ) : (
                  "ー"
                )}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">平均診療時間</div>
              <div className="metric-val">
                {avgWork !== null ? (
                  <>
                    {avgWork}
                    <span className="metric-unit">分</span>
                  </>
                ) : (
                  "ー"
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-label">患者別の内訳</div>
          <div className="legend">
            <span className="badge b-travel">移動</span>
            <span className="badge b-prep">準備</span>
            <span className="badge b-work">診療</span>
            <span className="badge b-total">合計</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>患者名</th>
                  <th style={{ width: "18%" }}>移動</th>
                  <th style={{ width: "18%" }}>準備</th>
                  <th style={{ width: "19%" }}>診療</th>
                  <th style={{ width: "20%" }}>合計</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((r, i) => {
                  const pid = String(r[4] || "ー");
                  const displayName = displayPatient(pid);
                  return (
                    <tr key={i}>
                      <td>{displayName}</td>
                      <td>
                        <MinuteBadge value={r[6]} cls="b-travel" />
                      </td>
                      <td>
                        <MinuteBadge value={r[7]} cls="b-prep" />
                      </td>
                      <td>
                        <MinuteBadge value={r[8]} cls="b-work" />
                      </td>
                      <td>
                        <MinuteBadge value={r[9]} cls="b-total" />
                      </td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td>合計</td>
                  <td>
                    {travels.length ? (
                      <MinuteBadge value={tSum} cls="b-travel" />
                    ) : (
                      <span className="dash">ー</span>
                    )}
                  </td>
                  <td>
                    <span className="dash">ー</span>
                  </td>
                  <td>
                    {works.length ? (
                      <MinuteBadge value={wSum} cls="b-work" />
                    ) : (
                      <span className="dash">ー</span>
                    )}
                  </td>
                  <td>
                    <MinuteBadge value={totalTime} cls="b-total" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {facilitySummaryData.length > 0 && (
          <div className="card">
            <div className="card-label">施設別の内訳</div>
            <div className="legend">
              <span className="badge b-travel">移動</span>
              <span className="badge b-prep">準備</span>
              <span className="badge b-work">診療</span>
              <span className="badge b-total">合計</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: "28%" }}>施設名</th>
                    <th style={{ width: "12%" }}>患者</th>
                    <th style={{ width: "15%" }}>移動</th>
                    <th style={{ width: "15%" }}>準備</th>
                    <th style={{ width: "15%" }}>診療</th>
                    <th style={{ width: "15%" }}>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {facilitySummaryData.map((r, i) => (
                    <tr key={i}>
                      <td>{String(r[4] || "ー")}</td>
                      <td>
                        {r[5]}
                        <span style={{ fontSize: 11, color: "#b07070" }}>人</span>
                      </td>
                      <td>
                        <MinuteBadge value={r[7]} cls="b-travel" />
                      </td>
                      <td>
                        <MinuteBadge value={r[8]} cls="b-prep" />
                      </td>
                      <td>
                        <MinuteBadge value={r[9]} cls="b-work" />
                      </td>
                      <td>
                        <MinuteBadge value={r[10]} cls="b-total" />
                      </td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>合計</td>
                    <td>
                      {facilitySummaryData.reduce((a, r) => a + Number(r[5] || 0), 0)}
                      <span style={{ fontSize: 11, color: "#b07070" }}>人</span>
                    </td>
                    <td>
                      {fTravels.length ? (
                        <MinuteBadge value={fTravelSum} cls="b-travel" />
                      ) : (
                        <span className="dash">ー</span>
                      )}
                    </td>
                    <td>
                      <span className="dash">ー</span>
                    </td>
                    <td>
                      {fWorks.length ? (
                        <MinuteBadge value={fWorkSum} cls="b-work" />
                      ) : (
                        <span className="dash">ー</span>
                      )}
                    </td>
                    <td>
                      <MinuteBadge value={fTotalSum} cls="b-total" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="app-root">
        <div className="header">
          <div className="header-name">業務記録システム</div>
          <div className="header-sub">菊南病院｜読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="header">
        <div className="header-name">{user ? user.staffName : "業務記録システム"}</div>
        <div className="header-sub">
          {user
            ? `菊南病院｜${user.jobType}｜${user.workplace}`
            : "菊南病院｜まずユーザー設定をしてください"}
        </div>
      </div>

      <div className="tab-row">
        <button
          className={`tab-btn ${tab === "setup" ? "active" : ""}`}
          onClick={() => setTab("setup")}
        >
          設定
        </button>
        {user && (
          <>
            <button
              className={`tab-btn ${tab === "record" ? "active" : ""}`}
              onClick={() => setTab("record")}
            >
              記録
            </button>
            <button
              className={`tab-btn ${tab === "summary" ? "active" : ""}`}
              onClick={() => setTab("summary")}
            >
              集計
            </button>
          </>
        )}
      </div>

      <div id="pane-setup" className={`pane ${tab === "setup" ? "active" : ""}`}>
        <div className="card">
          <div className="card-label">スタッフ情報</div>
          <input
            type="text"
            placeholder="スタッフ名（例：室原 ほまれ）"
            autoComplete="name"
            value={inpName}
            onChange={(e) => setInpName(e.target.value)}
          />
          <input
            type="text"
            placeholder="職種（例：医師 / 看護師）"
            value={inpJob}
            onChange={(e) => setInpJob(e.target.value)}
          />
          <input
            type="text"
            placeholder="勤務場所（例：訪問診療）"
            value={inpPlace}
            onChange={(e) => setInpPlace(e.target.value)}
          />
          <button className="btn-primary" onClick={doSetup}>
            登録して記録画面へ
          </button>
          {setupStatus.msg && (
            <div className={`status-msg status-${setupStatus.type}`}>{setupStatus.msg}</div>
          )}
        </div>
      </div>

      <div id="pane-record" className={`pane ${tab === "record" ? "active" : ""}`}>
        <div className="card">
          <div className="card-label">業務を記録</div>
          <div className="privacy-note">
            <b>最初は施設名だけでOK。</b> 音声で施設名＋業務（到着・カルテ記載・注射など）を話してください。患者名は話さないでください（Claude に名前は送りません）。
          </div>

          <details className="patient-picker-optional">
            <summary>患者を選択（診療・注射などのとき。カルテ記載・到着だけなら省略可）</summary>
            <div className="patient-picker">
            <div className="patient-picker-label">
              患者を選択（診療・注射・点滴などの記録時に必須）
              {selectedPatientPid && (
                <span style={{ color: "#c0535c", marginLeft: 6 }}>
                  ✓ {displayPatient(selectedPatientPid)}
                </span>
              )}
            </div>
            <div className="patient-chips">
              {patients.length === 0 ? (
                <span style={{ fontSize: 13, color: "#d4a0a5" }}>下で患者を追加してください</span>
              ) : (
                patients.map((p) => (
                  <button
                    key={p.pid}
                    type="button"
                    className={`patient-chip ${selectedPatientPid === p.pid ? "selected" : ""}`}
                    onClick={() =>
                      setSelectedPatientPid(selectedPatientPid === p.pid ? null : p.pid)
                    }
                  >
                    {p.displayName}
                  </button>
                ))
              )}
            </div>
            <div className="patient-add-row">
              <input
                type="text"
                placeholder="新しい患者名（この端末だけに保存）"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
              />
              <button type="button" className="patient-add-btn" onClick={addPatient}>
                追加
              </button>
            </div>
            </div>
          </details>

          <div className="voice-hint">
            <div className="voice-hint-icon">
              <svg viewBox="0 0 24 24">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </div>
            <div className="voice-hint-text">
              {voiceHintExamples(user?.jobType ?? "")}
            </div>
          </div>
          <textarea
            className="record-input"
            placeholder={voiceInputPlaceholder(user?.jobType ?? "")}
            rows={3}
            value={utterance}
            onChange={(e) => setUtterance(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={doRecord}
            disabled={!utterance.trim() || !user}
          >
            記録する
          </button>
          {recordStatus.msg && (
            <div className={`status-msg status-${recordStatus.type}`}>{recordStatus.msg}</div>
          )}
        </div>

        {resultRows && (
          <div className="card">
            <div className="card-label">解析結果</div>
            <div className="result-row">
              <span className="result-label">発話内容</span>
              <span className="result-value">{resultUtterance}</span>
            </div>
            {resultRows.map((row, i) => {
              const facility = row[4] && row[4] !== "不明" ? String(row[4]) : "";
              const patient = formatLogPatient(String(row[6] || "不明"), facility);
              const event = String(row[7] || "不明");
              return (
                <div className="result-row" key={i}>
                  <span className="result-label">
                    記録{resultRows.length > 1 ? i + 1 : ""}
                  </span>
                  <span className="result-value">
                    {facility && <span className="log-facility">{facility}</span>}
                    {patient} <Badge event={event} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="card">
          <div className="card-label">本日のログ</div>
          {logs.length === 0 ? (
            <div className="empty-state">記録はまだありません</div>
          ) : (
            logs.map((l, idx) => (
              <div className="log-item" key={idx}>
                <span className="log-time">{l.time}</span>
                <div className="log-body">
                  <div className="log-patient">
                    {l.rows.map((r, ri) => {
                      const facility = r[4] && r[4] !== "不明" ? String(r[4]) : "";
                      const patient = formatLogPatient(String(r[6] || "不明"), facility);
                      const event = String(r[7] || "不明");
                      return (
                        <span key={ri} style={{ display: "contents" }}>
                          {ri > 0 && (
                            <span style={{ color: "#d4a0a5", margin: "0 3px" }}>／</span>
                          )}
                          {facility && <span className="log-facility">{facility}</span>}
                          <span className="log-name">{patient}</span>
                          <Badge event={event} />
                        </span>
                      );
                    })}
                  </div>
                  <div className="log-utterance">{l.utterance}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div id="pane-summary" className={`pane ${tab === "summary" ? "active" : ""}`}>
        {renderSummary()}
      </div>
    </div>
  );
}
