import { createHash } from "crypto";

export function generatePid(patientName: string): string {
  if (!patientName || patientName === "不明" || patientName === "解析失敗") {
    return patientName;
  }
  const hash = createHash("sha256").update(patientName, "utf8").digest("hex");
  return "PID_" + hash.substring(0, 12).toUpperCase();
}

export function maskUtterance(utterance: string, patientName: string): string {
  if (!patientName || patientName === "不明" || patientName === "解析失敗") {
    return utterance;
  }
  return utterance.split(patientName).join("〇〇");
}

export function isValidPid(pid: string): boolean {
  return Boolean(pid && pid !== "不明" && pid !== "解析失敗" && pid.startsWith("PID_"));
}
