import { NextRequest, NextResponse } from "next/server";
import { fetchEpisode } from "@/lib/data";

// スワイプカード用: 第1話の本文を取得
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const novelId = searchParams.get("novelId");
  const episodeNumber = Number(searchParams.get("episodeNumber") || "1");

  if (!novelId) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  const episode = await fetchEpisode(novelId, episodeNumber);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json({ episode });
}
