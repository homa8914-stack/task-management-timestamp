import { requiresPatientSelection } from "./events";

/** サーバー側 generatePid と同じアルゴリズム（ブラウザ用） */
export async function generatePidClient(patientName: string): Promise<string> {
  if (!patientName || patientName === "不明" || patientName === "解析失敗") {
    return patientName;
  }
  const data = new TextEncoder().encode(patientName);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "PID_" + hash.substring(0, 12).toUpperCase();
}

/** @deprecated requiresPatientSelection を使用 */
export function needsPatientSelection(eventTypes: string[]): boolean {
  return eventTypes.some((t) => requiresPatientSelection(t));
}
