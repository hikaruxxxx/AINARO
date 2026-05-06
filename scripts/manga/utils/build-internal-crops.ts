#!/usr/bin/env tsx
/**
 * L05c learner の出力 (data/manga/reference_pool/_learner_runs/{source}-{date}.json)
 * を読んで、各 panel を crop して `data/manga/reference_pool/_internal_crops/{source}/`
 * に保存し、provenance manifest を書き出す。
 *
 * **重要**: 入力は商業 Kindle 漫画なので、source_type は "kindle_archive"、
 * rights_status は "internal_only" 固定。L02 などの production 経路には絶対に
 * 流さない。本クロップは人間の curation/review 用 internal viewer 専用。
 *
 * 使い方:
 *   npx tsx scripts/manga/utils/build-internal-crops.ts \
 *     --source level-gacha-vol1
 *   # → data/manga/reference_pool/_learner_runs/level-gacha-vol1-{latest}.json を読んで
 *   #   data/manga/reference_pool/_internal_crops/level-gacha-vol1/
 *   #   に *.png + _manifest.json を出力
 *
 * オプション:
 *   --treatments detailed_bg,floating_ui   (default: 全部)
 *   --learner-run <path>                   (デフォルトは最新の {source}-*.json)
 *   --out <dir>                            (default: data/manga/reference_pool/_internal_crops)
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";

type BgTreatment =
  | "detailed_bg" | "atmospheric_fade" | "tone_back"
  | "solid_white" | "solid_black" | "floating_ui" | "skip";

type LearnerPanel = {
  panel_no: number;
  bg_treatment: BgTreatment;
  rationale: string;
  bbox_normalized?: { x: number; y: number; w: number; h: number };
};

type LearnerPage = {
  page_no: number;
  image_path: string;
  spread: boolean;
  panels: LearnerPanel[];
};

type LearnerRun = {
  schema_version: 1;
  source: string;
  generated_at: string;
  method: string;
  page_count: number;
  pages: LearnerPage[];
};

type CropManifestEntry = {
  asset_id: string;
  path: string;
  source_type: "kindle_archive";
  rights_status: "internal_only";
  source_image: string;
  source_page_no: number;
  source_panel_no: number;
  bg_treatment: BgTreatment;
  rationale: string;
  bbox_pixels: { x: number; y: number; w: number; h: number };
  bbox_normalized: { x: number; y: number; w: number; h: number };
  created_at: string;
  notes: string;
};

type CropManifest = {
  schema_version: 1;
  source: string;
  learner_run_path: string;
  rights_warning: string;
  generated_at: string;
  crops: CropManifestEntry[];
};

type Args = {
  source: string;
  treatments?: BgTreatment[];
  learnerRun?: string;
  outRoot: string;
};

function parseArgs(argv: string[]): Args {
  let source: string | undefined;
  let treatments: BgTreatment[] | undefined;
  let learnerRun: string | undefined;
  let outRoot = "data/manga/reference_pool/_internal_crops";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") source = argv[++i];
    else if (a === "--treatments") {
      treatments = argv[++i].split(",").map((s) => s.trim() as BgTreatment);
    } else if (a === "--learner-run") learnerRun = argv[++i];
    else if (a === "--out") outRoot = argv[++i];
  }
  if (!source) {
    console.error("--source <name> required (e.g., level-gacha-vol1)");
    process.exit(1);
  }
  return { source, treatments, learnerRun, outRoot };
}

async function findLatestLearnerRun(source: string): Promise<string> {
  const runsDir = path.resolve("data/manga/reference_pool/_learner_runs");
  const items = await fs.readdir(runsDir);
  const matches = items
    .filter((f) => f.startsWith(`${source}-`) && f.endsWith(".json"))
    .sort();
  if (matches.length === 0) {
    throw new Error(`no learner run found for source=${source} in ${runsDir}`);
  }
  return path.join(runsDir, matches[matches.length - 1]);
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runPath = args.learnerRun ?? (await findLatestLearnerRun(args.source));
  const runRaw = await fs.readFile(runPath, "utf-8");
  const run = JSON.parse(runRaw) as LearnerRun;
  console.log(`[crop] source=${args.source} learner_run=${runPath} pages=${run.pages.length}`);

  const outDir = path.resolve(args.outRoot, args.source);
  await fs.mkdir(outDir, { recursive: true });

  const allowed = new Set(args.treatments ?? [
    "detailed_bg", "atmospheric_fade", "tone_back",
    "solid_white", "solid_black", "floating_ui",
  ]);

  const crops: CropManifestEntry[] = [];
  let cropped = 0;
  let skipped = 0;
  let failed = 0;

  for (const page of run.pages) {
    if (page.panels.length === 0) continue;
    let img: sharp.Sharp;
    let imgWidth = 0;
    let imgHeight = 0;
    try {
      img = sharp(page.image_path);
      const meta = await img.metadata();
      imgWidth = meta.width ?? 0;
      imgHeight = meta.height ?? 0;
      if (!imgWidth || !imgHeight) throw new Error("metadata missing");
    } catch (e) {
      console.warn(`[crop] page ${page.page_no}: image read failed: ${(e as Error).message}`);
      failed++;
      continue;
    }

    for (const panel of page.panels) {
      if (!allowed.has(panel.bg_treatment)) {
        skipped++;
        continue;
      }
      if (!panel.bbox_normalized) {
        skipped++;
        continue;
      }
      const bn = panel.bbox_normalized;
      const x = Math.round(clamp01(bn.x) * imgWidth);
      const y = Math.round(clamp01(bn.y) * imgHeight);
      const w = Math.max(1, Math.round(clamp01(bn.w) * imgWidth));
      const h = Math.max(1, Math.round(clamp01(bn.h) * imgHeight));
      // 範囲はみ出し補正
      const safeW = Math.min(w, imgWidth - x);
      const safeH = Math.min(h, imgHeight - y);
      if (safeW <= 1 || safeH <= 1) {
        console.warn(`[crop] page ${page.page_no} panel ${panel.panel_no}: bbox out of bounds, skip`);
        skipped++;
        continue;
      }

      const cropName = `page_${String(page.page_no).padStart(4, "0")}_p${String(panel.panel_no).padStart(2, "0")}_${panel.bg_treatment}.png`;
      const outPath = path.join(outDir, cropName);
      try {
        await sharp(page.image_path)
          .extract({ left: x, top: y, width: safeW, height: safeH })
          .png()
          .toFile(outPath);
        cropped++;
        crops.push({
          asset_id: `kindle_${args.source}_p${page.page_no}_panel${panel.panel_no}`,
          path: path.relative(path.resolve(args.outRoot), outPath),
          source_type: "kindle_archive",
          rights_status: "internal_only",
          source_image: page.image_path,
          source_page_no: page.page_no,
          source_panel_no: panel.panel_no,
          bg_treatment: panel.bg_treatment,
          rationale: panel.rationale,
          bbox_pixels: { x, y, w: safeW, h: safeH },
          bbox_normalized: { x: bn.x, y: bn.y, w: bn.w, h: bn.h },
          created_at: new Date().toISOString(),
          notes: "kindle_archive 由来。L02/L05 の production reference には絶対に流さないこと",
        });
      } catch (e) {
        console.warn(`[crop] page ${page.page_no} panel ${panel.panel_no}: extract failed: ${(e as Error).message}`);
        failed++;
      }
    }
  }

  const manifest: CropManifest = {
    schema_version: 1,
    source: args.source,
    learner_run_path: runPath,
    rights_warning:
      "ここに保存される全 PNG は商業 Kindle 漫画由来 (kindle_archive)。" +
      "AI training/inference には使用禁止。人間の curation/review 専用。",
    generated_at: new Date().toISOString(),
    crops,
  };
  const manifestPath = path.join(outDir, "_manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`[crop] cropped=${cropped} skipped=${skipped} failed=${failed}`);
  console.log(`[crop] manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
