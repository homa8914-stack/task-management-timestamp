import { NextResponse } from "next/server";
import { getStaffByEmail, writeLog } from "@/lib/records";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ success: true, isRegistered: false, reason: "email_blank" });
  }

  try {
    const user = await getStaffByEmail(email);
    if (user) {
      return NextResponse.json({ success: true, isRegistered: true, user });
    }
    return NextResponse.json({ success: true, isRegistered: false, email });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function POST() {
  await writeLog("ログイン", "アプリを起動しました");
  return NextResponse.json({ success: true });
}
