import { NextRequest, NextResponse } from "next/server";
import { fetchRankedNovels } from "@/lib/data";

// おすすめAPI
// クエリパラメータ genres（カンマ区切り）でジャンルフィルタ
// exclude（カンマ区切り）で除外するnovel IDを指定
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const genresParam = searchParams.get("genres");
    const excludeParam = searchParams.get("exclude");
    const locale = searchParams.get("locale") || "ja";

    const novels = await fetchRankedNovels({ limit: 50, locale });

    const excludeIds = new Set(
      excludeParam ? excludeParam.split(",").filter(Boolean) : []
    );

    let filtered = novels.filter((n) => !excludeIds.has(n.id));

    // ジャンルフィルタがある場合、該当ジャンルを優先しつつ他も混ぜる
    if (genresParam) {
      const preferredGenres = new Set(genresParam.split(",").filter(Boolean));
      const preferred = filtered.filter((n) => preferredGenres.has(n.genre));
      const others = filtered.filter((n) => !preferredGenres.has(n.genre));
      // 好みジャンルを先に、残りをスコア順で追加
      filtered = [...preferred, ...others];
    }

    return NextResponse.json({ novels: filtered.slice(0, 20) });
  } catch {
    return NextResponse.json({ novels: [] }, { status: 500 });
  }
}
