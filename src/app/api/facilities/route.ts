import { NextResponse } from "next/server";
import { addFacility, getFacilityList } from "@/lib/records";
import { isSheetsConfigured } from "@/lib/sheets";

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ success: true, facilities: [] });
  }

  try {
    const facilities = await getFacilityList();
    return NextResponse.json({ success: true, facilities });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google Sheets が未設定です。" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { name } = body;
  if (!name?.trim()) {
    return NextResponse.json({ success: false, error: "施設名が空です" }, { status: 400 });
  }

  try {
    await addFacility(name.trim());
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
