import { NextResponse } from "next/server";
import { loadEnvConfig } from "@next/env";
import { getSheetsConfigStatus, isSheetsConfigured } from "@/lib/sheets";

export async function GET() {
  loadEnvConfig(process.cwd());
  const key = process.env.CLAUDE_API_KEY?.trim().replace(/^["']|["']$/g, "") ?? "";
  return NextResponse.json({
    ok: true,
    storage: "google-sheets",
    claudeKeyConfigured: key.length > 0,
    sheetsConfigured: isSheetsConfigured(),
    sheetsStatus: getSheetsConfigStatus(),
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
  });
}