// PV数を読みやすい形式に変換（例: 12345 → "1.2万"）
export function formatPV(pv: number): string {
  if (pv >= 100_000_000) return `${(pv / 100_000_000).toFixed(1)}億`;
  if (pv >= 10_000) return `${(pv / 10_000).toFixed(1)}万`;
  return pv.toLocaleString();
}

// 文字数を読みやすい形式に変換（例: 50000 → "5万字"）
export function formatCharCount(count: number): string {
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万字`;
  return `${count.toLocaleString()}字`;
}

// 日付を「2026年4月6日」形式に変換
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 日付を「4/6」形式に変換
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 相対時間（例: "3時間前"）
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return formatDate(dateStr);
}
