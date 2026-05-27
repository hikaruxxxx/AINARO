/**
 * Migrate Volume Plot: 4 ドメイン契約フィールドの逆抽出付与
 *
 * 2026-05-21 S1.10 で新設 (本来 S2 送りだったが v02 結果を見てユーザ判断で前倒し)。
 *
 * 既存 plot.json (V2 でない旧版) に、以下のフィールドを LLM 逆抽出で追加する:
 *   - top-level: volume_spine, reader_question_schedule
 *   - episodes[*]: episode_spine (humiliation / secret_or_treasure / awakening / payback / title_anchor)
 *
 * 既存フィールド (episodes / beats / scenes / cliffhanger_hook / foreshadow_map) は **一切触らない**。
 * 既に上記 4 フィールドがある場合は skip (--overwrite で上書き可)。
 *
 * storyboard.json との整合性を壊さないため、scene の page_range や cast_ids は変更しない。
 * episode_spine.page は scene.page_range の中から推定される。
 *
 * 使い方:
 *   node --import tsx scripts/manga/migrate-volume-plot-spine.ts --slug a07-modern-dungeon --volume 1
 *   node --import tsx scripts/manga/migrate-volume-plot-spine.ts --slug a07-modern-dungeon --volume 1 --dry-run
 *   node --import tsx scripts/manga/migrate-volume-plot-spine.ts --slug a07-modern-dungeon --volume 1 --overwrite
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, volumePlotPath } from "./layers/_paths";
import { runCodexText } from "../../src/lib/manga/llm/codex-text";
import {
  validateVolumePlotContracts,
  type VolumePlot,
  type VolumeEpisodePlan,
} from "../../src/lib/manga/storyboard-v2/volume-plot";
import type { BibleSnapshotV2 } from "../../src/lib/manga/schemas-v2";
import type { VolumeSpine } from "../../src/lib/manga/storyboard-v2/volume-spine";
import type { ReaderQuestionSchedule } from "../../src/lib/manga/storyboard-v2/reader-questions";
import type { EpisodeSpine } from "../../src/lib/manga/storyboard-v2/episode-spine";

type Args = {
  slug: string;
  volume: number;
  dryRun: boolean;
  overwrite: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = { dryRun: false, overwrite: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "slug") {
      a.slug = next;
      i++;
    } else if (key === "volume") {
      a.volume = Number(next);
      i++;
    } else if (key === "dry-run" || key === "dryRun") {
      a.dryRun = true;
    } else if (key === "overwrite") {
      a.overwrite = true;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  if (a.volume === undefined) throw new Error("--volume required");
  return a as Args;
}

const VOLUME_LEVEL_SCHEMA = `
type VolumeLevelOutput = {
  volume_spine: {
    central_reader_question: string;       // 80-150字
    protagonist_irreversible_choice: string; // 80-120字
    price_paid: string;                    // 60-100字
    new_status_quo: string;                // 80-120字
    volume_end_buy_question: string;       // 60-100字
  };
  reader_question_schedule: Array<{
    question_id: string;                   // "Q01" 形式
    question: string;                      // 60-120字
    opened_in_episode: number;
    escalated_in_episodes: number[];
    answered_in_episode?: number;
    carried_to_next_volume: boolean;
    payoff_type: "answer" | "reversal" | "bigger_question" | "emotional_payoff";
    heat_role: "main_buy_question" | "episode_pull" | "mystery_layer" | "relationship_tension";
                                            // main_buy_question は exactly 1 個
  }>;
};
`;

const EPISODE_SPINE_SCHEMA = `
type EpisodeSpinesOutput = {
  episodes: Array<{
    episode_no: number;
    episode_spine: {
      humiliation_event?: {
        page: number;                      // 該当 scene の page_range から推定
        humiliator_character_id: string;   // bible.characters[].id (role="antagonist" を推奨)
        audience: string;
        insult: string;
        unfairness: string;
        protagonist_cannot_answer_yet: string;
        reader_emotion_target: "anger" | "shame" | "revenge_desire";
        payback_hint_episode: number;
        severity: 1 | 2 | 3 | 4 | 5;
      };
      secret_or_treasure_event: {
        page: number;
        secret_type: "system_reveal" | "hidden_rule" | "ally_secret" | "treasure" | "knowledge";
        visual_signature: string;
      };
      awakening_event: {
        page: number;
        awakening_type: "skill" | "resolve" | "alliance" | "knowledge_application";
        intensity_target: number;          // 0-1
      };
      payback_event: {
        page: number;
        payback_type: "direct_combat" | "social_reveal" | "system_break" | "unexpected_alliance";
        visual_catharsis_signature: string;
        intensity_target: number;
      };
      title_anchor?: {                     // 該当する emotional anchor がある episode のみ
        page: number;
        trigger_event: string;
        visual_pose: string;
        emotional_function: "awakening" | "revenge_start" | "identity_claim";
        overlay_logo_asset: string;        // "tbd_S2" で可
      };
    };
  }>;
};
`;

async function extractVolumeLevel(args: {
  bible: BibleSnapshotV2;
  plot: VolumePlot;
}): Promise<{
  volume_spine: VolumeSpine;
  reader_question_schedule: ReaderQuestionSchedule;
}> {
  const ep_summaries = args.plot.episodes
    .map(
      (ep) =>
        `### ep${ep.episode_no}: ${ep.title_working}\n- theme: ${ep.theme}\n- cliffhanger: ${ep.cliffhanger_hook}\n- core_hook_usage: ${ep.core_hook_usage ?? "(未設定)"}`,
    )
    .join("\n\n");
  const foreshadow_summary = args.plot.foreshadow_map
    .map((f) => `- ep${f.seed_in_episode} → ep${f.payoff_in_episode}: ${f.description}`)
    .join("\n");

  const result = await runCodexText({
    task: [
      "あなたは商業漫画の編集者として、既存の巻プロットから 4 ドメイン契約のうち Domain A (巻論理契約) を逆抽出してください。",
      "",
      "## 目的",
      "既存 plot.json は volume_theme と episodes / foreshadow_map を持っているが、",
      "「読者が次巻を買う理由」「主人公の不可逆な選択」「読者の能動的な問い」が",
      "独立フィールドで明示されていない。本タスクではこれらを **既存の物語に忠実に**",
      "逆抽出して構造化する (新しい物語を作らない)。",
      "",
      "## 入力: 巻プロット情報",
      `### 巻タイトル: ${args.plot.title_working}`,
      `### 巻テーマ: ${args.plot.volume_theme}`,
      `### 推定 page 数: ${args.plot.estimated_pages}`,
      "",
      "### 各 episode サマリ",
      ep_summaries,
      "",
      "### foreshadow_map",
      foreshadow_summary,
      "",
      "## 抽出ルール",
      "- volume_spine の 5 フィールドは既存テーマ + episodes 全体から忠実に組み立てる",
      "- reader_question_schedule の問いは foreshadow_map と独立 (foreshadow = 物語事実、reader_question = 読者の能動的な問い)",
      "- 問いは 5-9 個、main_buy_question は exactly 1 個",
      "- 各 episode で最低 1 個解消できる構造 (answered_in_episode を該当 episode に設定)",
      "- 巻末未解決 2-4 個 (carried_to_next_volume=true、次巻持ち越し)",
      "- ⚠️ 物語を改変しない、新しい設定を加えない。既存 plot に存在する要素のみで構成",
      "",
      "## 出力スキーマ",
      "```typescript",
      VOLUME_LEVEL_SCHEMA,
      "```",
      "",
      "## 出力形式",
      "JSON のみ返す。説明文・前置きなし。```json ... ``` で囲む。",
    ].join("\n"),
    format: "json",
    timeoutMs: 10 * 60 * 1000,
    maxRetries: 1,
  });
  if (!result.parsed) throw new Error("volume-level 抽出失敗");
  return result.parsed as {
    volume_spine: VolumeSpine;
    reader_question_schedule: ReaderQuestionSchedule;
  };
}

async function extractEpisodeSpines(args: {
  bible: BibleSnapshotV2;
  plot: VolumePlot;
}): Promise<Map<number, EpisodeSpine>> {
  const ep_details = args.plot.episodes
    .map((ep) => {
      const scenesText = (ep.scenes ?? [])
        .map(
          (s) =>
            `    - s${s.scene_no} p${s.page_range[0]}-${s.page_range[1]} @${s.location_id} [${s.directing_intent?.kind ?? "normal"}] key_action: ${s.key_action}`,
        )
        .join("\n");
      const beatsText = ep.beats
        .map((b) => `    - [${b.label}] ${b.summary} (intensity=${b.emotional_intensity})`)
        .join("\n");
      return `### ep${ep.episode_no}: ${ep.title_working} (page_target=${ep.page_target})\n  theme: ${ep.theme}\n  cliffhanger: ${ep.cliffhanger_hook}\n  beats:\n${beatsText}\n  scenes:\n${scenesText}`;
    })
    .join("\n\n");

  const antagonistsBlock =
    (args.bible.antagonists ?? [])
      .map(
        (a) =>
          `- ${a.character_id} (type=${a.antagonist_type}, first_humiliation=v${a.first_humiliation_volume}ep${a.first_humiliation_episode})`,
      )
      .join("\n") || "(antagonist 未登録)";

  const result = await runCodexText({
    task: [
      "あなたは商業漫画の編集者として、既存の各 episode から episode_spine (Domain B: 話情緒契約) を逆抽出してください。",
      "",
      "## 目的",
      "既存の beats / scenes / cliffhanger から、WEBTOON ヒット型 5 段階 (侮辱→秘宝→覚醒→反撃→ROAR)",
      "の **既存物語内での該当箇所** を構造化フィールドとして抽出する。",
      "**新しい物語を加えず、既存 plot の中から最も近い要素を選ぶ**。",
      "",
      "## 重要な制約",
      "- 該当する scene/beat が **存在しない** 場合は **その field を出力しない** (undefined にする)",
      "- 例: ep1 に侮辱イベントが該当 scene として存在しないなら humiliation_event を出力しない",
      "- 例: 全 episode で title_anchor が該当 scene として存在しないなら title_anchor を出力しない",
      "- ⚠️ 「埋めるために創作する」のは禁止、既存物語からの抽出のみ",
      "- page は scene.page_range の **どこか 1 つ** を選ぶ (page_range[0] = scene 冒頭、page_range[1] = scene 末)",
      "- humiliator_character_id は **下記 antagonist の中から選ぶ** (それ以外の character は使わない)",
      "",
      "## bible.antagonists",
      antagonistsBlock,
      "",
      "## 各 episode の元情報",
      ep_details,
      "",
      "## 抽出指針 (5 イベントの定義)",
      "- humiliation_event: 主人公が公衆 or 制度の前で侮辱・拒絶される scene (anger/shame/revenge_desire を読者に喚起)",
      "- secret_or_treasure_event: 主人公だけが知る隠しルール / 秘宝 / システム情報の獲得 scene",
      "- awakening_event: 主人公が新たな能力・覚悟・知識を発揮する scene (intensity 0.75+)",
      "- payback_event: 主人公が侮辱 / 障害を打破する scene (intensity 0.85+)",
      "- title_anchor: 主人公の決定的ポーズ + 作品アイデンティティ再提示の scene (該当する場合のみ)",
      "",
      "## 出力スキーマ",
      "```typescript",
      EPISODE_SPINE_SCHEMA,
      "```",
      "",
      "## 出力形式",
      "JSON のみ返す。説明文・前置きなし。```json ... ``` で囲む。全 episode を episode_no 昇順で出力。",
    ].join("\n"),
    format: "json",
    timeoutMs: 15 * 60 * 1000,
    maxRetries: 1,
  });
  if (!result.parsed) throw new Error("episode-spine 抽出失敗");
  const parsed = result.parsed as {
    episodes?: Array<{ episode_no: number; episode_spine: EpisodeSpine }>;
  };
  if (!parsed.episodes || parsed.episodes.length === 0) {
    throw new Error("episode-spine: episodes が空");
  }
  const out = new Map<number, EpisodeSpine>();
  for (const e of parsed.episodes) {
    out.set(e.episode_no, e.episode_spine);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const sbPath = bibleSnapshotPath(args.slug);
  const plotPath = volumePlotPath(args.slug, args.volume);

  const bible = JSON.parse(await fs.readFile(sbPath, "utf-8")) as BibleSnapshotV2;
  const plot = JSON.parse(await fs.readFile(plotPath, "utf-8")) as VolumePlot;

  console.log(
    `[migrate-spine] slug=${args.slug} vol=${args.volume} eps=${plot.episodes.length}`,
  );

  // 既存フィールドの存在確認
  const hasVolumeSpine = !!plot.volume_spine;
  const hasReaderQ = (plot.reader_question_schedule ?? []).length > 0;
  const episodesWithSpine = plot.episodes.filter((e) => e.episode_spine).length;

  console.log(
    `[migrate-spine] existing: volume_spine=${hasVolumeSpine} reader_q=${hasReaderQ} ep_spines=${episodesWithSpine}/${plot.episodes.length}`,
  );

  if (!args.overwrite && hasVolumeSpine && hasReaderQ && episodesWithSpine === plot.episodes.length) {
    console.log(`[migrate-spine] 全フィールド既に存在、skip (--overwrite で再実行可)`);
    return;
  }

  if (args.dryRun) {
    console.log("[migrate-spine] --dry-run、Codex 呼び出しせず終了");
    return;
  }

  // バックアップ
  const backupPath = `${plotPath}.pre-spine.${new Date().toISOString().replace(/[:.]/g, "")}.backup`;
  await fs.copyFile(plotPath, backupPath);
  console.log(`[migrate-spine] backup: ${path.basename(backupPath)}`);

  // Pass 1: 巻全体 (volume_spine + reader_question_schedule)
  console.log("[migrate-spine] Pass 1: volume-level (Codex ~5min)...");
  const volumeLevel = await extractVolumeLevel({ bible, plot });
  plot.volume_spine = volumeLevel.volume_spine;
  plot.reader_question_schedule = volumeLevel.reader_question_schedule;
  console.log(
    `[migrate-spine] volume_spine.central_reader_question: ${plot.volume_spine.central_reader_question.slice(0, 80)}...`,
  );
  console.log(
    `[migrate-spine] reader_question_schedule: ${plot.reader_question_schedule!.length} 問`,
  );

  // Pass 2: 全 episode の episode_spine (一括)
  console.log("[migrate-spine] Pass 2: episode-spines (Codex ~10min)...");
  const epSpines = await extractEpisodeSpines({ bible, plot });
  let assigned = 0;
  for (const ep of plot.episodes) {
    const spine = epSpines.get(ep.episode_no);
    if (spine) {
      ep.episode_spine = spine;
      assigned++;
    }
  }
  console.log(`[migrate-spine] episode_spine assigned: ${assigned}/${plot.episodes.length}`);

  // 整合性検証 (lax = "classic" で実行、warning のみ)
  const warnings = validateVolumePlotContracts({ plot, archetypeStyle: "classic" });
  if (warnings.length > 0) {
    console.warn(`[migrate-spine] 契約 warnings (${warnings.length} 件、lax mode):`);
    for (const w of warnings.slice(0, 20)) {
      console.warn(`  ${w}`);
    }
    if (warnings.length > 20) {
      console.warn(`  ... and ${warnings.length - 20} more`);
    }
  }

  // 書き戻し
  await fs.writeFile(plotPath, JSON.stringify(plot, null, 2));
  console.log(`[migrate-spine] saved: ${plotPath}`);
}

main().catch((e) => {
  console.error("[migrate-spine] FAILED:", e);
  process.exit(1);
});
