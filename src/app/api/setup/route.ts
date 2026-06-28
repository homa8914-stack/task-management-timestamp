import { NextResponse } from "next/server";
import { extractUserInfo } from "@/lib/claude";
import { buildUserEmail, normalizeUser, writeLog } from "@/lib/records";

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
      email || buildUserEmail(extracted.staffName, extracted.jobType, extracted.workplace);

    const user = normalizeUser({
      id: userEmail,
      email: userEmail,
      staffName: extracted.staffName,
      jobType: extracted.jobType,
      workplace: extracted.workplace,
    })!;

    await writeLog("セットアップ", `${user.staffName}さんとして登録`, userEmail);

    return NextResponse.json({
      success: true,
      message: `${user.staffName}さんとしてセットしました`,
      user,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
