/**
 * @deprecated Phase 4 で削除予定。
 *
 * 旧 修正指示 UI HTTP server (port 5180) の後方互換 shim。
 * 中身は scripts/manga/serve-ops.ts に統合済み。
 *
 * 動作:
 *   1. port 5174 で ops console が既に立っているなら、案内を出して exit (二重書き込み事故防止)
 *   2. そうでなければ port 5180 で serve-ops.ts を起動 (旧 default port 互換)
 *
 * 引数 (--slug --episode --port --no-open) は完全互換で素通しする。
 *
 * 移行先: `npx tsx scripts/manga/serve-ops.ts ...` を直接呼び、http://localhost:5174/ にアクセス。
 */
import "./_env";
import net from "node:net";

console.warn(
  "[serve-revision] Phase 4 で削除予定の shim です。serve-ops.ts に統合済み:\n" +
    "  npx tsx scripts/manga/serve-ops.ts --slug ... --episode N\n" +
    "  → http://localhost:5174/ で revision UI が開きます"
);

function isPort5174Listening(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(5174, "127.0.0.1");
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(v);
    };
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    sock.setTimeout(500, () => finish(false));
  });
}

async function main() {
  if (await isPort5174Listening()) {
    console.warn(
      "[serve-revision] port 5174 で ops console が既に起動中のためこの shim は exit します。\n" +
        "  http://localhost:5174/                                    (revision UI)\n" +
        "  http://localhost:5174/episodes/epNN/name/index.html        (name preview)\n"
    );
    process.exit(0);
  }
  // port が argv に無ければ旧 default (5180) を inject
  if (!process.argv.some((a) => a === "--port" || a.startsWith("--port="))) {
    process.argv.push("--port", "5180");
  }
  await import("./serve-ops");
}

main().catch((e) => {
  console.error("[serve-revision shim] FAILED:", e);
  process.exit(1);
});
