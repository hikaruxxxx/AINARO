/**
 * HTTP request body の JSON 読み取り共通実装
 *
 * 旧 serve-name.ts / serve-revision.ts の readJsonBody を集約。
 * - 200KB を超えたら req.destroy で受信打ち切り (DoS 防止)
 * - JSON parse 失敗は reject、空 body は {} を返す (旧と互換)
 */
import type http from "node:http";

const MAX_BODY_BYTES = 200_000;

export async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
      total += b.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(b);
    });
    req.on("end", () => {
      try {
        const s = Buffer.concat(chunks).toString("utf-8");
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
