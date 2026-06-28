import { NextResponse } from "next/server";
import {
  getSheetsConfigStatus,
  isSheetsConfigured,
  testSheetsConnection,
} from "@/lib/sheets";

export async function GET() {
  const status = getSheetsConfigStatus();

  if (!isSheetsConfigured()) {
    return NextResponse.json({
      configured: false,
      ok: false,
      message: "Google Sheets の環境変数が未設定です",
      status,
      hint: "npm run dev を再起動し、.env の3項目を確認してください",
    });
  }

  const result = await testSheetsConnection();
  return NextResponse.json({
    configured: true,
    status,
    ...result,
  });
}
