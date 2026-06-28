import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const facilities = await prisma.facility.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ success: true, facilities: facilities.map((f) => f.name) });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name } = body;
  if (!name?.trim()) {
    return NextResponse.json({ success: false, error: "施設名が空です" }, { status: 400 });
  }

  await prisma.facility.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {},
  });

  return NextResponse.json({ success: true });
}
