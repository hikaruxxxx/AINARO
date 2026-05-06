import { build } from "esbuild";
import path from "node:path";

export async function buildOpsConsoleClient(opts: {
  outDir?: string;
  minify?: boolean;
}): Promise<{ outFile: string }> {
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, opts.outDir ?? "dist/ops-console");
  const outFile = path.join(outDir, "main.js");

  await build({
    entryPoints: {
      main: path.resolve(repoRoot, "src/lib/manga/ops-console/web/main.ts"),
      styles: path.resolve(repoRoot, "src/lib/manga/ops-console/web/styles/index.css"),
    },
    outdir: outDir,
    bundle: true,
    format: "iife",
    target: "es2020",
    sourcemap: "inline",
    minify: opts.minify ?? false,
    logLevel: "warning",
    loader: { ".css": "css" },
    // 日本語ラベル ("世界観・設定" 等) を unicode escape せずそのまま吐く。
    // ブラウザ動作には影響しないが grep / debug 時に readable になる。
    charset: "utf8",
  });

  return { outFile };
}
