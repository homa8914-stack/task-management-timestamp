import { NextResponse } from "next/server";
import { normalizeUser } from "@/lib/records";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ success: true, isRegistered: false, reason: "email_blank" });
  }

  return NextResponse.json({
    success: true,
    isRegistered: false,
    email,
    message: "スタッフ情報は端末に保存されます。",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = normalizeUser(body.user);
    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ success: true });
  }
}
