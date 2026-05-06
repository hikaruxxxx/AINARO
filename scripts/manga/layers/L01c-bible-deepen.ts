/**
 * L1.6 Bible Deepen
 *
 * snapshot.json + lint_report.json + V2企画書 + 画風参考フレーム説明 を Codex CLI text に流し、
 * 浅さを埋める patch を取得 → snapshot.json を deepen 後版に書き戻し (旧版は snapshot.bak-{timestamp}.json として退避)
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L01c-bible-deepen.ts \
 *     --slug a07-modern-dungeon \
 *     --concept data/manga/_archive/.../A07_v2.json \
 *     --style-ref-note "なろう系コミカライズ ライト青年漫画。線細め..."
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, bibleDir } from "./_paths";
import { loadV2Concept } from "../../../src/lib/manga/bible/v2-adapter";
import { lintBible } from "../../../src/lib/manga/qa-v2/bible-lint";
import { runDeepExtractor, applyDeepEnhancements } from "../../../src/lib/manga/bible/deep-extractor";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  concept: string;
  styleRefNote?: string;
  styleRefNoteFile?: string;
  reLint: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = { reLint: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "concept") a.concept = val;
    else if (key === "style-ref-note") a.styleRefNote = val;
    else if (key === "style-ref-note-file") a.styleRefNoteFile = val;
    else if (key === "no-relint") a.reLint = false;
  }
  if (!a.slug || !a.concept) throw new Error("--slug and --concept required");
  return a as Args;
}

const DEFAULT_STYLE_REF_NOTE = `参考: 「現代ダンジョン × ガチャ × システム音声」系のなろう系コミカライズ。
- 画風: ライト青年漫画 (シャミセン書房系/講談社マガポケ系)
- 線: 細め、確信のある主線、ハッチング控えめ
- ベタ: 主要キャラの黒髪と影に集中、画面全体は白多め
- スクリーントーン: 背景・服の陰影に軽く、ベタトーンは使わない
- 瞳: 大きめ、ハイライト強い (絶望系劇画ではない)
- 背景: establishing 以外はミニマル、コマ内は人物優先
- 吹き出し: 縦書き、丁寧に整列、SE は手書きカタカナで控えめ
- キャラ表情: 感情が分かりやすい (Tokyo Ghoul のような曖昧/退廃ではない)
NEGATIVES: 重い陰影 / 過剰なトーン / 写真風 / 3D塗り / 海外コミック調`;

async function main() {
  const args = parseArgs();
  const concept = await loadV2Concept(path.resolve(args.concept));
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;

  const styleRefNote = args.styleRefNoteFile
    ? await fs.readFile(args.styleRefNoteFile, "utf-8")
    : args.styleRefNote ?? DEFAULT_STYLE_REF_NOTE;

  console.log(`[L01c] slug=${args.slug}`);
  console.log(`[L01c] running pre-deepen lint (static-only, fast)...`);
  const preLint = await lintBible({ bible, skipLlm: true });
  console.log(`[L01c] pre-lint: fatal=${preLint.fatal_count} warn=${preLint.warn_count}`);

  console.log(`[L01c] running deep extractor (Codex CLI text, ~5-10min)...`);
  const patch = await runDeepExtractor({
    v2Concept: concept,
    currentBible: bible,
    lintReport: preLint,
    styleReferenceNote: styleRefNote,
  });
  console.log(`[L01c] patch: characters=${(patch.characters_patch ?? []).length} +locs=${(patch.locations_add ?? []).length} +props=${(patch.props_add ?? []).length} +motifs=${(patch.visual_motifs_add ?? []).length} +costumes=${(patch.costumes_add ?? []).length} relations=${(patch.relations_replace ?? []).length}`);

  const enhanced = applyDeepEnhancements({ bible, patch: patch as never });

  // 旧版をタイムスタンプ付き backup として退避し、本体を上書き
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const backup = path.join(bibleDir(args.slug), `snapshot.bak-${ts}.json`);
  await fs.writeFile(backup, JSON.stringify(bible, null, 2));
  await fs.writeFile(bibleSnapshotPath(args.slug), JSON.stringify(enhanced, null, 2));
  console.log(`[L01c] backup of pre-deepen bible → ${backup}`);
  console.log(`[L01c] saved enhanced → ${bibleSnapshotPath(args.slug)}`);

  if (args.reLint) {
    console.log(`[L01c] running post-deepen lint (static-only)...`);
    const postLint = await lintBible({ bible: enhanced, skipLlm: true });
    console.log(`[L01c] post-lint: fatal=${postLint.fatal_count} warn=${postLint.warn_count} (改善: fatal -${preLint.fatal_count - postLint.fatal_count} / warn -${preLint.warn_count - postLint.warn_count})`);
    await fs.writeFile(path.join(bibleDir(args.slug), "lint_report.json"), JSON.stringify(postLint, null, 2));
  }

  console.log(`[L01c] DONE`);
  console.log(`[L01c] characters: ${enhanced.characters.length} | locations: ${enhanced.locations.length} | props: ${enhanced.props.length} | motifs: ${enhanced.visual_motifs.length} | costumes: ${enhanced.costumes.length} | relations: ${enhanced.relations.length} | continuity_seeds: ${enhanced.continuity_seeds.length}`);
}

main().catch((e) => { console.error("[L01c] FAILED:", e); process.exit(1); });
