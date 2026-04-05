import { NextRequest, NextResponse } from "next/server";
import { fetchNovelById } from "@/lib/data";

// 複数の小説IDから基本情報をバッチ取得
export async function POST(req: NextRequest) {
  const { ids } = await req.json() as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ novels: [] });
  }

  // 最大20件まで
  const limitedIds = ids.slice(0, 20);

  const novels = await Promise.all(
    limitedIds.map(async (id) => {
      const novel = await fetchNovelById(id);
      if (!novel) return null;
      return {
        id: novel.id,
        slug: novel.slug,
        title: novel.title,
        cover_image_url: novel.cover_image_url,
        total_chapters: novel.total_chapters,
        latest_chapter_at: novel.latest_chapter_at,
      };
    })
  );

  return NextResponse.json({
    novels: novels.filter(Boolean),
  });
}
