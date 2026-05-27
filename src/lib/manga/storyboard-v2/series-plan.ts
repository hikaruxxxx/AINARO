/**
 * SeriesPlan Generator
 *
 * bible.snapshot + V2企画書 → series_plan.json
 *
 * 本作レベル (全N巻) の長期 arc 配分・主人公成長弧・core_hook 進化を一括設計する。
 * L2b --phase=series で 1 回だけ生成し、各巻の VolumePlot 生成時に context として
 * 渡される。
 *
 * 設計原則:
 *   - 章 (arc) は巻またぎ標準。volume_range で明示
 *   - arcs は 4-6 個 (序章/展開/危機/結末 を最低 4)
 *   - protagonist_long_arc.arc_endings は arcs.length と同数
 *   - core_hook の進化を明示することで「全巻が同じ展開」を防ぐ
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2, SeriesPlan, ArcPlan } from "../schemas-v2";
import type { V2Concept } from "../bible/v2-adapter";
import { findGenreByArtStyle } from "../storyboard/genre-presets";

const SERIES_PLAN_SCHEMA = `
type SeriesPlanOutput = {
  series_theme: string;                  // 全シリーズのテーマ 200字+
  long_arc_outline: string;              // 全N巻でどう進むか 2000字 (各巻の到達点を明示)
  arcs: Array<{
    arc_id: string;                      // "arc_01_awakening" 形式 (snake_case 推奨)
    arc_name: string;                    // 表示名 (例: "ナビ覚醒編")
    arc_phase: "prologue" | "rising" | "crisis" | "climax" | "epilogue";
    volume_range: [number, number];      // 例 [1, 3] = vol 1-3 にまたがる (巻またぎ標準)
    arc_theme: string;                   // 章テーマ 150字
    protagonist_growth: string;          // この章で主人公が何を獲得/失うか 150字
    turning_points: Array<{
      volume: number;                    // 何巻で
      episode: number;                   // 何話で (1-N、巻内の話番号)
      event: string;                     // 何が起きるか 80字
    }>;                                  // 各 arc に 2-4 個
    arc_opening: string;                 // 章開幕の hook 80字
    arc_climax: string;                  // 章クライマックス 80字
    arc_resolution: string;              // 章決着 80字
  }>;
  protagonist_long_arc: {
    starting_state: string;              // 第1巻冒頭の主人公状態 150字
    arc_endings: string[];               // 各 arc 終了時の主人公状態 (各150字、arcs.length と同数)
    final_state: string;                 // 最終巻終了時の主人公状態 150字
  };
  core_hook_evolution: string;           // core_hook が全シリーズでどう進化するか 300字
};
`;

function buildCoreHookContract(bible: BibleSnapshotV2): string {
  const coreHook = bible.meta.core_hook;
  if (!coreHook) {
    return [
      "## Core Hook Contract (必須参照)",
      "- 未設定。bible 側で core_hook が無いため、meta.genre から一文ギミックを推定して core_hook_evolution を設計すること。",
    ].join("\n");
  }
  return [
    "## Core Hook Contract (必須参照)",
    `- 一文: ${coreHook.one_liner}`,
    `- 類型: ${coreHook.type} / メカニクス: ${coreHook.mechanic ?? "(未設定)"}`,
    `- 読者の問い: ${coreHook.reader_question ?? "(未設定)"}`,
    `- 報酬モード: ${coreHook.reward_mode ?? "(未設定)"}`,
    `- 参考作: ${coreHook.hit_references.join(", ")}`,
    "",
    "→ core_hook_evolution では、この一文が全シリーズでどう拡張/反転/深化するかを示す。",
    "  例: 序章 = 主人公だけが声を聞く / 展開 = 声の正体を疑い始める / 危機 = 声が嘘をつく / 結末 = 主人公が声無しで判断する",
  ].join("\n");
}

function buildSeriesCraftRules(): string {
  return [
    "## シリーズ構造の作法 (必須遵守、商業漫画の標準)",
    "- **章境界 ≠ 巻境界**: 1 章が 2-4 巻にまたがるのが標準 (鬼滅「無限列車編」=Vol7-8 / 進撃「マーレ編」=Vol23-)",
    "- **arc_phase の配分**: prologue 1 個 / rising 1-2 個 / crisis 1-2 個 / climax 1 個 / epilogue 0-1 個",
    "- **主人公の精神的成長段階**: 各 arc 終了時の状態が前 arc から確実に変化すること (arc_endings 必須)",
    "- **turning_points の置き方**: 各 arc に 2-4 個。volume × episode で位置を明示し、巻またぎを意識する",
    "- **arc_opening / arc_climax / arc_resolution**: 章の hook / 山場 / 決着を 80 字で凝縮 (これが各巻の VolumePlot 生成の指針になる)",
    "- **core_hook_evolution**: 「全巻同じ展開」回避の最重要レバー。序→展開→危機→結末で core_hook の意味/制約/反転を進化させる",
    "",
    "## 序破急 / 3 幕構成の参照",
    "- 序 (prologue, ~25%): 世界観 + 主人公 + 中心ガジェット (core_hook) の確立",
    "- 破 (rising + crisis, ~50%): core_hook の応用 → 反転 → 主人公が一度失敗する",
    "- 急 (climax + epilogue, ~25%): 主人公が core_hook 無しで判断 → 解決 → 余韻",
  ].join("\n");
}

export async function generateSeriesPlan(args: {
  bible: BibleSnapshotV2;
  v2Concept: V2Concept;
  /** 総巻数。bible.meta.estimated_volumes と一致させること */
  totalVolumes: number;
  cwd?: string;
  timeoutMs?: number;
}): Promise<SeriesPlan> {
  const genrePreset = findGenreByArtStyle(args.bible.meta.art_style);
  const genreLabel = genrePreset
    ? `${genrePreset.display_name} (${genrePreset.art_style})`
    : `汎用 (${args.bible.meta.art_style ?? "art_style未設定"})`;

  const result = await runCodexText({
    task: [
      `あなたは商業漫画 (${genreLabel}) の **シリーズ全体構成編集者** として、`,
      `全 ${args.totalVolumes} 巻の長期 arc 配分を設計してください。`,
      "",
      "## あなたの責務",
      "- 巻ではなく、章 (arc) 単位で物語の精神的構造を設計する",
      "- 主人公が全シリーズを通してどう変化するかを arc_endings で時系列に明示する",
      "- core_hook が全シリーズでどう進化するかを設計する (序破急)",
      "- 各 arc がどの巻にまたがるかを volume_range で明示する (巻またぎ標準)",
      "",
      buildSeriesCraftRules(),
      "",
      buildCoreHookContract(args.bible),
      "",
      "## bible (登場人物 / 世界観 / 主要関係性 / 視覚モチーフ)",
      "```json",
      JSON.stringify(
        {
          meta: {
            slug: args.bible.meta.slug,
            genre: (args.bible.meta as { genre?: string }).genre ?? null,
            art_style: args.bible.meta.art_style,
            estimated_volumes: args.bible.meta.estimated_volumes,
            target_episodes_per_volume: args.bible.meta.target_episodes_per_volume,
            target_pages_per_episode: args.bible.meta.target_pages_per_episode,
            target_pages_per_volume: args.bible.meta.target_pages_per_volume,
            tone_profile: args.bible.meta.tone_profile,
          },
          world: args.bible.world,
          characters: args.bible.characters.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
          })),
          relations: args.bible.relations
            .filter((r) => r.is_recommended_pairing === true)
            .map((r) => ({
              from_character_id: r.from_character_id,
              to_character_id: r.to_character_id,
              relation_type: r.relation_type,
              description: r.description,
              appeal_axis: r.appeal_axis,
            })),
          visual_motifs: args.bible.visual_motifs,
        },
        null,
        2,
      ).slice(0, 25000),
      "```",
      "",
      "## V2企画書 main_arc / volume_outline (素材)",
      "```json",
      JSON.stringify(
        {
          main_arc: args.v2Concept.main_arc,
          volume_outline: args.v2Concept.volume_outline,
        },
        null,
        2,
      ).slice(0, 25000),
      "```",
      "",
      "## 出力スキーマ",
      "```typescript",
      SERIES_PLAN_SCHEMA,
      "```",
      "",
      "## 期待する量",
      `- arcs: 4-6 個 (prologue 1 / rising 1-2 / crisis 1-2 / climax 1 / epilogue 0-1)`,
      `- arcs[].volume_range は全 ${args.totalVolumes} 巻をカバー (空きや重複は最小限、巻またぎ歓迎)`,
      `- protagonist_long_arc.arc_endings は arcs.length と同数 (各 arc 終了時の主人公状態)`,
      "- long_arc_outline は 2000字以上 (各巻の到達点を全巻分明示)",
      "- core_hook_evolution は 300字以上",
      "",
      "## 注意事項",
      "- bible.volume_synopsis が含まれていても**読み込まない**。volume_synopsis は最終巻に関する情報が混入している可能性があるため、long_arc_outline はあなた自身が main_arc + volume_outline から再設計する",
      "- arc_id は snake_case で衝突しない一意名 (例: arc_01_awakening, arc_02_ascend, arc_03_doubt, arc_04_collapse, arc_05_rebuild)",
      "",
      "## 出力形式",
      "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ].join("\n"),
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 15 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) throw new Error("series-plan JSON 抽出失敗");
  const parsed = result.parsed as Omit<
    SeriesPlan,
    "schema_version" | "slug" | "total_volumes" | "generated_at"
  >;

  // arcs.length と arc_endings.length の整合性検証
  if (
    !parsed.arcs ||
    parsed.arcs.length === 0 ||
    !parsed.protagonist_long_arc ||
    parsed.protagonist_long_arc.arc_endings?.length !== parsed.arcs.length
  ) {
    // デバッグ: Claude/Codex から返ってきた parsed JSON の構造を覗く
    const parsedKeys = Object.keys(parsed as Record<string, unknown>);
    const head = JSON.stringify(parsed).slice(0, 500);
    throw new Error(
      `series-plan 検証失敗: arcs.length=${parsed.arcs?.length} と arc_endings.length=${parsed.protagonist_long_arc?.arc_endings?.length} が不一致\n  parsed top-level keys: [${parsedKeys.join(", ")}]\n  parsed head: ${head}`,
    );
  }

  return {
    schema_version: 1,
    slug: args.bible.meta.slug,
    total_volumes: args.totalVolumes,
    generated_at: new Date().toISOString(),
    ...parsed,
  };
}

/**
 * SeriesPlan から特定の volume が属する arc を抽出するヘルパー。
 * 1 巻が複数 arc にまたがる場合は配列で返す (順序は arcs 順)。
 */
export function findArcsForVolume(seriesPlan: SeriesPlan, volumeNo: number): ArcPlan[] {
  return seriesPlan.arcs.filter(
    (arc) => arc.volume_range[0] <= volumeNo && volumeNo <= arc.volume_range[1],
  );
}

/**
 * volume が arc 内で占める位置を推定する。
 * partial_start = arc の最初の巻 / partial_mid = 中間 / partial_end = 最後 / full = 単巻
 */
export function classifyVolumeCoverage(
  arc: ArcPlan,
  volumeNo: number,
): "full" | "partial_start" | "partial_mid" | "partial_end" {
  const [start, end] = arc.volume_range;
  if (start === end) return "full";
  if (volumeNo === start) return "partial_start";
  if (volumeNo === end) return "partial_end";
  return "partial_mid";
}
