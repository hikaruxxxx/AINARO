// 長編生成パイプライン v3 - Layer 0 初期化スクリプト
//
// プロファイルを選択し、work ディレクトリを初期化する。
// LLM呼び出しなし、ファイル操作のみ。
//
// 使い方:
//   npx tsx scripts/generation/longform-init.ts <slug> <profile_type>
// 例:
//   npx tsx scripts/generation/longform-init.ts demo_hellmode hellmode_type

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const PROFILES_DIR = "data/generation/profiles";
const WORKS_DIR = "data/generation/works";

interface ProfileMeta {
  target_episodes: number | string;
  target_chapters: number | string;
  expected_total: number;
}

function parseProfileYaml(path: string): ProfileMeta {
  // 簡易 YAML パース（target_episodes, target_chapters, expected_total のみ抽出）
  const text = readFileSync(path, "utf-8");
  const grab = (key: string): string | undefined => {
    const re = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m");
    const m = re.exec(text);
    return m?.[1]?.trim();
  };
  const targetEp = grab("target_episodes") ?? "100";
  const targetCh = grab("target_chapters") ?? "2-3";
  const total = grab("expected_total") ?? "40";
  return {
    target_episodes: /^\d+$/.test(targetEp) ? parseInt(targetEp, 10) : targetEp,
    target_chapters: /^\d+$/.test(targetCh) ? parseInt(targetCh, 10) : targetCh,
    expected_total: parseInt(total, 10),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const [slug, profileType] = args;

  if (!slug || !profileType) {
    console.error("Usage: npx tsx scripts/generation/longform-init.ts <slug> <profile_type>");
    process.exit(1);
  }

  // slug 検証
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    console.error(`[ERROR] slug must contain only alphanumeric, underscore, or hyphen: ${slug}`);
    process.exit(1);
  }

  // profile 存在確認
  const profilePath = join(PROFILES_DIR, profileType, "profile.yaml");
  if (!existsSync(profilePath)) {
    console.error(`[ERROR] profile_not_found: ${profilePath}`);
    console.error(`Available profiles:`);
    try {
      const fs = require("fs");
      const dirs = fs.readdirSync(PROFILES_DIR);
      dirs.forEach((d: string) => console.error(`  - ${d}`));
    } catch {
      console.error(`  (no profiles directory found)`);
    }
    process.exit(1);
  }

  // 既存 work チェック
  const longformDir = join(WORKS_DIR, slug, "longform");
  if (existsSync(longformDir)) {
    console.error(`[ERROR] already_initialized: ${longformDir}`);
    console.error(`To re-init, manually remove the directory first.`);
    process.exit(1);
  }

  // ディレクトリ作成
  mkdirSync(join(longformDir, "world_bible"), { recursive: true });
  mkdirSync(join(longformDir, "episodes"), { recursive: true });

  // profile から target 値を抽出
  const profileMeta = parseProfileYaml(profilePath);

  // _meta.json 生成
  const meta = {
    slug,
    profile_type: profileType,
    created_at: new Date().toISOString(),
    current_layer: 0,
    completed_layers: [0],
    target_episodes: profileMeta.target_episodes,
    target_chapters: profileMeta.target_chapters,
    expected_total: profileMeta.expected_total,
    chapters: [],
    audited_episodes: [],
    status: "initialized",
  };

  const metaPath = join(longformDir, "_meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

  // レポート
  console.log(`=== Layer 0 完了: ${slug} ===`);
  console.log(`プロファイル: ${profileType}`);
  console.log(`出力ディレクトリ: ${longformDir}/`);
  console.log(`目標話数: ${profileMeta.target_episodes}`);
  console.log(`目標章数: ${profileMeta.target_chapters}`);
  console.log(`目標スコア: ${profileMeta.expected_total}+ / 84`);
  console.log("");
  console.log("次のステップ:");
  console.log(`  /build-world-bible ${slug}`);
}

main();
