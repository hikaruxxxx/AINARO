/**
 * Web Push 送信ユーティリティ
 * EXIT戦略v5 §依存設計解禁: 継続率(D1/D7/M3)を伸ばすためのプッシュ通知基盤
 */

import webpush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@novelis.tokyo";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID鍵が設定されていません");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// 単一購読への送信。失効購読を呼び出し側で削除できるようエラーを返す
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<{ success: boolean; gone: boolean; error?: string }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 }, // 12時間以内に届かなければ破棄
    );
    return { success: true, gone: false };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    // 404/410 は購読失効
    const gone = e.statusCode === 404 || e.statusCode === 410;
    return { success: false, gone, error: e.message || "unknown" };
  }
}
