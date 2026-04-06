import { NextResponse } from "next/server";
import { fetchRankedNovels } from "@/lib/data";

// ディスカバーフィード用API
// ランダム性を加えてスコア順とは違う発見体験を提供
export async function GET() {
  try {
    const novels = await fetchRankedNovels({ limit: 30 });

    // Fisher-Yatesシャッフル（上位作品に軽い重み付け）
    const shuffled = [...novels];
    for (let i = shuffled.length - 1; i > 0; i--) {
      // 上位ほど前に残りやすいバイアス
      const bias = Math.pow(Math.random(), 0.7);
      const j = Math.floor(bias * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return NextResponse.json({ novels: shuffled.slice(0, 20) });
  } catch {
    return NextResponse.json({ novels: [] }, { status: 500 });
  }
}
