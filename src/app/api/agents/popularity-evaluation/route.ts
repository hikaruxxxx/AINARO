import { NextRequest, NextResponse } from "next/server";
import { analyzePopularity } from "@/lib/agents/popularity-evaluation/analyzer";
import type { PopularityGenre } from "@/types/agents";

const VALID_GENRES: PopularityGenre[] = [
  "fantasy",
  "romance",
  "horror",
  "mystery",
  "scifi",
  "slice_of_life",
];

const MIN_TEXT_LENGTH = 500;

/**
 * POST /api/agents/popularity-evaluation — 小説テキストの人気評価
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, genre } = body;

    // テキストのバリデーション
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "テキストは必須です" },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();
    if (trimmedText.length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: `テキストは${MIN_TEXT_LENGTH}文字以上必要です（現在${trimmedText.length}文字）`,
        },
        { status: 400 }
      );
    }

    // ジャンルのバリデーション（指定された場合のみ）
    if (genre && !VALID_GENRES.includes(genre)) {
      return NextResponse.json(
        {
          error: `無効なジャンルです。有効な値: ${VALID_GENRES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 分析実行
    const result = analyzePopularity(trimmedText, genre as PopularityGenre | undefined);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
