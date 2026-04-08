// 夜間Cron: 公開済み作品の読者シグナルを集計して
// data/training/{positive,feedback}/ に学習データを蓄積する。
//
// vercel.json の crons に登録する想定:
//   { "path": "/api/cron/ingest-feedback", "schedule": "30 3 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { ingestFeedback } from "@/lib/training/feedback-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5分

export async function POST(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const summary = await ingestFeedback();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[ingest-feedback] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// GETでも叩けるようにする（手動実行用）
export async function GET(req: NextRequest) {
  return POST(req);
}
