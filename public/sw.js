// Novelis Service Worker - Web Push通知対応

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// プッシュ通知受信
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Novelis";
  const options = {
    body: data.body || "新しい更新があります",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/",
    },
    tag: data.tag || "novelis-update",
    // 同一tagの通知は上書き
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリック時の処理
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // 既存のタブがあればフォーカス
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // なければ新しいタブを開く
      return self.clients.openWindow(url);
    })
  );
});
