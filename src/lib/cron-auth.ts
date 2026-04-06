/**
 * Vercel Cron認証ヘルパー
 * 全Cronエンドポイントで共通使用
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Cronリクエストの認証チェック
 * Vercel CronはAuthorizationヘッダーにCRON_SECRETを付与する
 */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
