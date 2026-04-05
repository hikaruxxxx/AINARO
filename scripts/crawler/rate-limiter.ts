// BAN防止のためのレートリミッター

/** ランダムな待機時間を生成して待つ */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  console.log(`  ⏳ ${(delay / 1000).toFixed(1)}秒待機...`);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** 指数バックオフ付きリトライ */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  backoffBase: number
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) return response;

    // 429 (Too Many Requests) or 503 (Service Unavailable) → バックオフ
    if (response.status === 429 || response.status === 503) {
      if (attempt === maxRetries) {
        throw new Error(`${url} から ${response.status} が返り、リトライ上限到達`);
      }
      const waitTime = backoffBase * Math.pow(2, attempt);
      console.warn(
        `  ⚠️ ${response.status} 受信。${(waitTime / 1000).toFixed(0)}秒バックオフ（${attempt + 1}/${maxRetries}）`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    // その他のエラー
    throw new Error(`${url} → HTTP ${response.status}`);
  }

  throw new Error("リトライ上限到達");
}
