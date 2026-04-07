"use client";

import { useState, useEffect, useCallback } from "react";

export default function PushNotificationButton() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);

    // 既にサブスクライブ済みか確認
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub);
      });
    });
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (permission === "unsupported") return;

    try {
      // Service Worker登録
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 通知許可をリクエスト
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      // VAPID公開鍵（環境変数から取得）
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn("VAPID公開鍵が設定されていません");
        return;
      }

      // Push購読
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      // サーバーに登録（将来的にAPIに送信）
      localStorage.setItem("ainaro_push_subscription", JSON.stringify(sub.toJSON()));
      setSubscribed(true);
    } catch (err) {
      console.error("Push通知の登録に失敗:", err);
    }
  }, [permission]);

  const handleUnsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        localStorage.removeItem("ainaro_push_subscription");
        setSubscribed(false);
      }
    } catch (err) {
      console.error("Push通知の解除に失敗:", err);
    }
  }, []);

  if (permission === "unsupported") return null;

  if (subscribed) {
    return (
      <button
        onClick={handleUnsubscribe}
        className="flex items-center gap-1.5 rounded-full border border-secondary bg-secondary/10 px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-secondary/20"
      >
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        通知ON
      </button>
    );
  }

  return (
    <button
      onClick={handleSubscribe}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-secondary hover:text-secondary"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      更新通知を受け取る
    </button>
  );
}

// VAPID鍵をUint8Arrayに変換
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
