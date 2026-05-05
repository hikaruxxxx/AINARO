/**
 * @deprecated Phase 4 で削除予定。
 *
 * 旧 L8.7 Name Approval HTTP server (port 5174) の後方互換 shim。
 * 中身は scripts/manga/serve-ops.ts に統合済み。
 *
 * 旧コマンド: `npx tsx scripts/manga/serve-name.ts --slug ... --episode N`
 * 引数 (--slug --episode --port --no-open) は完全互換で素通しする。
 *
 * 移行先: `npx tsx scripts/manga/serve-ops.ts ...` を直接呼ぶか、Phase 4 で削除。
 */
import "./_env";

console.warn(
  "[serve-name] Phase 4 で削除予定の shim です。serve-ops.ts に移行してください:\n" +
    "  npx tsx scripts/manga/serve-ops.ts --slug ... --episode N"
);

// argv をそのまま素通しで serve-ops.ts を起動 (5174 default)。
// import 副作用で main() が走る。
import("./serve-ops").catch((e) => {
  console.error("[serve-name shim] FAILED:", e);
  process.exit(1);
});
