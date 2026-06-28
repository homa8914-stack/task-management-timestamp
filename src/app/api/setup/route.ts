import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractUserInfo } from "@/lib/claude";
import { writeLog } from "@/lib/records";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { staffName, jobType, workplace, email } = body;

    let extracted = { staffName: "", jobType: "", workplace: "" };

    if (staffName && jobType && workplace) {
      extracted = { staffName, jobType, workplace };
    } else if (body.utterance) {
      extracted = await extractUserInfo(body.utterance);
    }

    if (!extracted.staffName || !extracted.jobType || !extracted.workplace) {
      return NextResponse.json(
        { success: false, error: "スタッフ情報を入力してください。" },
        { status: 400 }
      );
    }

    const userEmail =
      email ||
      `local_${extracted.staffName}_${extracted.jobType}_${extracted.workplace}`.replace(/\s/g, "_");

    const user = await prisma.staff.upsert({
      where: { email: userEmail },
      create: {
        email: userEmail,
        staffName: extracted.staffName,
        jobType: extracted.jobType,
        workplace: extracted.workplace,
      },
      update: {
        staffName: extracted.staffName,
        jobType: extracted.jobType,
        workplace: extracted.workplace,
      },
    });

    await writeLog("セットアップ", `${user.staffName}さんとして登録`, userEmail);

    return NextResponse.json({
      success: true,
      message: `${user.staffName}さんとしてセットしました`,
      user: {
        id: user.id,
        email: user.email,
        staffName: user.staffName,
        jobType: user.jobType,
        workplace: user.workplace,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
