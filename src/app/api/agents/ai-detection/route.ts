import { NextRequest, NextResponse } from "next/server";
import { analyzeText } from "@/lib/agents/ai-detection/analyzer";

const MIN_TEXT_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    // バリデーション
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "テキストが必要です" },
        { status: 400 }
      );
    }

    const charCount = [...text].length;
    if (charCount < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: `テキストは${MIN_TEXT_LENGTH}文字以上必要です（現在: ${charCount}文字）`,
        },
        { status: 400 }
      );
    }

    // 分析実行
    const result = analyzeText(text);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
