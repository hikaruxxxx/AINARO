import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// TODO: Phase 1で管理者認証チェックを追加する

// Vercel Serverless Functionのタイムアウトを60秒に延長
export const maxDuration = 60;

/**
 * POST /api/admin/novels/[id]/cover — 表紙画像を自動生成
 *
 * フロー:
 * 1. 小説メタデータをDBから取得
 * 2. Claude APIで画像生成用の英語プロンプトを生成
 * 3. OpenAI gpt-image-1で画像を生成
 * 4. Supabase Storageにアップロード
 * 5. novels.cover_image_urlを更新して返却
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // 1. 小説メタデータを取得
    const { data: novel, error: fetchError } = await supabase
      .from("novels")
      .select("id, title, synopsis, genre, tags")
      .eq("id", id)
      .single();

    if (fetchError || !novel) {
      return NextResponse.json(
        { error: "作品が見つかりません" },
        { status: 404 }
      );
    }

    // 2. Claude APIで画像生成プロンプトを生成
    const anthropic = new Anthropic();
    const promptResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `あなたは小説の表紙イラストを生成するためのプロンプトエンジニアです。
以下の小説情報から、画像生成AI向けの英語プロンプトを1つだけ生成してください。

タイトル: ${novel.title}
ジャンル: ${novel.genre}
あらすじ: ${novel.synopsis || "なし"}
タグ: ${(novel.tags as string[]).join(", ")}

要件:
- 書籍の表紙として適切な構図
- テキストや文字は含めない（タイトル文字等なし）
- 縦長のポートレート構図
- 具体的で視覚的な描写
- 英語で出力

プロンプトのみを出力してください。`,
        },
      ],
    });

    const imagePrompt =
      promptResponse.content[0].type === "text"
        ? promptResponse.content[0].text
        : "";

    if (!imagePrompt) {
      return NextResponse.json(
        { error: "画像生成プロンプトの生成に失敗しました" },
        { status: 500 }
      );
    }

    // 3. OpenAI gpt-image-1で画像を生成
    const openai = new OpenAI();
    const imageResponse = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1536",
    });

    const base64Image = imageResponse.data?.[0]?.b64_json;
    if (!base64Image) {
      return NextResponse.json(
        { error: "画像の生成に失敗しました" },
        { status: 500 }
      );
    }

    // 4. Supabase Storageにアップロード
    const fileName = `${id}.webp`;
    const buffer = Buffer.from(base64Image, "base64");

    const { error: uploadError } = await supabase.storage
      .from("novel-covers")
      .upload(fileName, buffer, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `画像のアップロードに失敗しました: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from("novel-covers")
      .getPublicUrl(fileName);

    const coverImageUrl = urlData.publicUrl;

    // 5. novels.cover_image_urlを更新
    const { error: updateError } = await supabase
      .from("novels")
      .update({ cover_image_url: coverImageUrl })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: `データベースの更新に失敗しました: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ cover_image_url: coverImageUrl });
  } catch (err) {
    console.error("表紙画像生成エラー:", err);
    return NextResponse.json(
      { error: "画像生成中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
