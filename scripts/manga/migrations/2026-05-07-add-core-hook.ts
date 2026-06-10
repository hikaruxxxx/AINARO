/**
 * 2026-05-07 中核ギミック one-liner gateway 追加に伴うマイグレーション。
 *
 * 既存 bible に meta.core_hook が未設定なものを L01c-bible-deepen で順次補完する。
 * L01c の deep-extractor が core_hook_patch を生成し、未設定 bible にのみ自動投入する。
 *
 * V2企画書 (`data/manga/_archive/**\/stage2/{SHORT}_v2.json`) を slug から自動検出して
 * `--concept` に渡す。命名規則は slug の先頭英字+数字を大文字化 (a07-modern-dungeon → A07)。
 *
 * 使い方:
 *   npx tsx scripts/manga/migrations/2026-05-07-add-core-hook.ts             # 全対象を順次実行
 *   npx tsx scripts/manga/migrations/2026-05-07-add-core-hook.ts --dry-run   # 対象一覧と検出結果のみ
 *   npx tsx scripts/manga/migrations/2026-05-07-add-core-hook.ts --slug=a07-modern-dungeon  # 単一作品
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_DIR = path.dirname(SELF_PATH);
const REPO_ROOT = path.resolve(SELF_DIR, "../../..");
const WORKS_DIR = path.join(REPO_ROOT, "data/manga/works");
const ARCHIVE_DIR = path.join(REPO_ROOT, "data/manga/_archive");

interface Args {
  dryRun: boolean;
  slug?: string;
}

function parseArgs(): Args {
  const args: Args = { dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--slug=")) args.slug = arg.slice("--slug=".length);
  }
  return args;
}

async function findTargets(specificSlug?: string): Promise<string[]> {
  const entries = await readdir(WORKS_DIR, { withFileTypes: true });
  const slugs = entries.filter((d) => d.isDirectory()).map((d) => d.name);
  const targets: string[] = [];
  for (const slug of slugs) {
    if (specificSlug && slug !== specificSlug) continue;
    const snapshotPath = path.join(WORKS_DIR, slug, "bible", "snapshot.json");
    if (!existsSync(snapshotPath)) continue;
    try {
      const text = await readFile(snapshotPath, "utf-8");
      const bible = JSON.parse(text) as { meta?: { core_hook?: unknown } };
      if (!bible?.meta?.core_hook) targets.push(slug);
    } catch (err) {
      console.warn(`[skip] ${slug}: snapshot.json 読み込み失敗 - ${(err as Error).message}`);
    }
  }
  return targets;
}

/** slug の先頭英字+数字を大文字化して V2企画書ファイル名 (A07_v2.json) を作る */
function slugToShortCode(slug: string): string | null {
  const m = slug.match(/^([a-z]+)(\d+)/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2]}`;
}

/** ARCHIVE_DIR を再帰走査して fileName と一致する最初のパスを返す */
async function findFileRecursive(rootDir: string, fileName: string): Promise<string | null> {
  if (!existsSync(rootDir)) return null;
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name === fileName) return fullPath;
    }
  }
  return null;
}

/** slug に対応する V2企画書 (`{SHORT}_v2.json`) を data/manga/_archive 以下から探す */
async function findV2ConceptPath(slug: string): Promise<string | null> {
  const code = slugToShortCode(slug);
  if (!code) return null;
  return await findFileRecursive(ARCHIVE_DIR, `${code}_v2.json`);
}

function runL01c(slug: string, conceptPath: string): { success: boolean; durationMs: number } {
  const start = Date.now();
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/manga/layers/L01c-bible-deepen.ts",
      `--slug=${slug}`,
      `--concept=${conceptPath}`,
    ],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
  return { success: result.status === 0, durationMs: Date.now() - start };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const targets = await findTargets(args.slug);

  if (targets.length === 0) {
    console.log("対象なし。すべての bible に core_hook が設定済み、または slug が見つからない。");
    return;
  }

  console.log(`[migration] core_hook 未設定の bible: ${targets.length}件`);
  // 各 slug に対して V2企画書のパスを事前検出
  const plan: Array<{ slug: string; conceptPath: string | null }> = [];
  for (const slug of targets) {
    const conceptPath = await findV2ConceptPath(slug);
    plan.push({ slug, conceptPath });
    const status = conceptPath ? `concept: ${path.relative(REPO_ROOT, conceptPath)}` : "concept: NOT FOUND";
    console.log(`  - ${slug} (${status})`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run のため実行は省略");
    return;
  }

  let success = 0;
  let failure = 0;
  let skipped = 0;
  for (const [i, { slug, conceptPath }] of plan.entries()) {
    if (!conceptPath) {
      console.warn(`\n[${i + 1}/${plan.length}] ${slug}: V2企画書が見つからない。skip`);
      skipped += 1;
      continue;
    }
    console.log(`\n[${i + 1}/${plan.length}] ${slug} で L01c-bible-deepen を実行中...`);
    const { success: ok, durationMs } = runL01c(slug, conceptPath);
    if (ok) {
      console.log(`  → 完了 (${(durationMs / 1000).toFixed(1)}s)`);
      success += 1;
    } else {
      console.error(`  → 失敗`);
      failure += 1;
    }
  }

  console.log(
    `\n[migration] 完了 ${success}件 / 失敗 ${failure}件 / skip ${skipped}件 / 全 ${plan.length}件`,
  );
  if (failure > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
