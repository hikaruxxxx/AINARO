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
    entryPoints: [path.resolve(repoRoot, "src/lib/manga/ops-console/web/main.ts")],
    outfile: outFile,
    bundle: true,
    format: "iife",
    target: "es2020",
    sourcemap: "inline",
    minify: opts.minify ?? false,
    logLevel: "warning",
  });

  return { outFile };
}
