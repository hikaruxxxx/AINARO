// PV数を読みやすい形式に変換（例: 12345 → "1.2万" / "12.3K"）
export function formatPV(pv: number, locale: string = "ja"): string {
  if (locale === "en") {
    if (pv >= 1_000_000) return `${(pv / 1_000_000).toFixed(1)}M`;
    if (pv >= 1_000) return `${(pv / 1_000).toFixed(1)}K`;
    return pv.toLocaleString("en-US");
  }
  if (pv >= 100_000_000) return `${(pv / 100_000_000).toFixed(1)}億`;
  if (pv >= 10_000) return `${(pv / 10_000).toFixed(1)}万`;
  return pv.toLocaleString();
}

// 文字数を読みやすい形式に変換（例: 50000 → "5万字" / "50K chars"）
export function formatCharCount(count: number, locale: string = "ja"): string {
  if (locale === "en") {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M chars`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K chars`;
    return `${count.toLocaleString("en-US")} chars`;
  }
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万字`;
  return `${count.toLocaleString()}字`;
}

// 日付を「2026年4月6日」/「April 6, 2026」形式に変換
export function formatDate(dateStr: string, locale: string = "ja"): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale === "en" ? "en-US" : "ja-JP", {
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

// 相対時間（例: "3時間前" / "3h ago"）
export function formatRelativeTime(dateStr: string, locale: string = "ja"): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (locale === "en") {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr, locale);
  }

  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return formatDate(dateStr, locale);
}
