/**
 * L1 ネーム層
 *
 * プロット骨格 + シーン分割 + キャラ/ロケ聖書 を入力に、
 * 「読者の脳内補完を誘発する」コマ列を構築する。
 *
 * Phase A 1巻管理向け再設計 (2026-05-01 Codex review 反映):
 *   - 出力を pages[] > panels[] のページ階層構造に変更
 *   - panel に importance / bubble_budget / turn_candidate / turn_strength /
 *     source_ref / negative_space_hint / render_risk を追加
 *   - L1.4 page-director の領分（テンプレ ID 選択・slot rect・1ページ密度リズム）は
 *     systemContext から削除し、ページの「物語的役割」と「コマ単位の演出意図」のみ残す
 *
 * Codex CLI 経由（ANTHROPIC_API_KEY 課金前提にしない原則）。
 */

import { extractStructuredJson } from "../llm/codex-text";
import type {
  PanelRole,
  PanelAspect,
  PanelCamera,
  PanelSpatialPosition,
  BubbleType,
  CharacterBibleRow,
  LocationBibleRow,
  NarrativeFunction,
} from "../types";
import type {
  EpisodePlotData,
  ShotlistPanelEntry,
  StoryboardPageEntry,
  StoryboardPageRole,
  TurnCandidate,
  BubbleBudget,
  SourceRef,
} from "../schemas";
import type { SceneEntry } from "../shotlist/scene-splitter";
import { getGenrePreset, type MangaGenreId } from "./genre-presets";

/** LLM が出力する panel（名前ベース、UUID 未変換） */
export type StoryboardPanel = {
  scene_id: string;
  beat_idx: number;
  role: PanelRole;
  aspect: PanelAspect;
  camera: PanelCamera;
  tempo: "fast" | "slow" | "stop";
  characters: string[];
  character_positions?: Record<string, PanelSpatialPosition>;
  location: string | null;
  narration?: string;
  dialogue?: Array<{
    speaker_name: string;
    text: string;
    intent?: string;
    bubble_type?: BubbleType;
  }>;
  emotion?: string;
  scroll_pause_intent?: number;
  multi_character_treatment?: "normal" | "distant" | "silhouette" | "split_panel";

  // ネーム層フィールド（必須）
  narrative_function: NarrativeFunction;
  purpose: string;
  change_from_prev: string;
  link_to_next?: string;
  reader_reaction_intended?: string;
  visual_focus: string;
  cut_type?: ShotlistPanelEntry["cut_type"];

  // Phase A Codex review 反映 (2026-05-01)
  importance: 1 | 2 | 3 | 4 | 5;
  bubble_budget: BubbleBudget;
  turn_candidate: TurnCandidate;
  turn_strength: 0 | 1 | 2 | 3 | 4 | 5;
  source_ref?: SourceRef;
  negative_space_hint?: string;
  render_risk?: "low" | "medium" | "high";
};

/** LLM が出力する page */
export type StoryboardPage = {
  page_idx: number;
  page_side?: "right" | "left";
  page_role: StoryboardPageRole;
  target_panels: number;
  page_open_hook?: string;
  page_end_hook?: string;
  turn_strength?: 0 | 1 | 2 | 3 | 4 | 5;
  panels: StoryboardPanel[];
};

export type StoryboardWarning = {
  panel_idx: number;
  scene_id: string;
  kind:
    | "missing_purpose"
    | "missing_change_from_prev"
    | "consecutive_face_close"
    | "consecutive_information"
    | "missing_silence_panel"
    | "too_many_characters"
    | "unknown_character"
    | "unknown_location"
    | "unknown_speaker"
    | "panel_count_drift"
    | "page_count_drift"
    | "low_importance_density"
    | "weak_episode_cliffhanger"
    | "missing_must_event"
    | "bubble_budget_violation";
  detail: string;
};

const SCHEMA = `
type Storyboard = {
  pages: Array<{
    page_idx: number;
    page_side?: 'right'|'left';     // RTL 横読み: 1=right が基本
    page_role: 'establishing'|'dialogue'|'action'|'reveal'|'aftermath'|'cliffhanger';
    target_panels: number;          // 4-8 が標準、splash は 1-2
    page_open_hook?: string;
    page_end_hook?: string;
    turn_strength?: 0|1|2|3|4|5;    // ページ末の引き強度。次ページめくらせる動機
    panels: Array<{
      scene_id: string;
      beat_idx: number;
      role: 'opening'|'emotion'|'information'|'action'|'transition'|'cliffhanger';
      aspect: 'page'|'spread'|'panel_landscape'|'panel_portrait'|'panel_square'|'panel_tall';
      camera: 'face_close'|'full_body'|'over_shoulder'|'birds_eye'|'hands'|'wide'|'side';
      tempo: 'fast'|'slow'|'stop';
      characters: string[];
      character_positions?: Record<string, 'left'|'center'|'right'|'foreground'|'background'>;
      location: string | null;

      narration?: string;
      dialogue?: Array<{
        speaker_name: string;
        text: string;
        intent?: string;
        bubble_type?: 'normal'|'thought'|'shout'|'whisper'|'narration';
      }>;
      emotion?: string;
      multi_character_treatment?: 'normal'|'distant'|'silhouette'|'split_panel';

      // ネーム層必須
      narrative_function: 'inform'|'emote'|'pause'|'contrast'|'reveal'|'silence'|'establishing'|'beat_button'|'reaction'|'cutaway';
      purpose: string;
      change_from_prev: string;
      link_to_next?: string;
      reader_reaction_intended?: string;
      visual_focus: string;
      cut_type?: 'match_action'|'shot_reverse'|'scale_jump'|'graphic_match'|'smash_cut'|'reveal_pull'|'time_skip';

      // Phase A 1巻管理拡張
      importance: 1|2|3|4|5;          // ネーム作家が意図したコマ重要度。L1.4 が slot 大小に使う
      bubble_budget: {                 // SVG重ね前提の文字量予算
        count: number;                 // 吹き出し数 (0=silent)
        max_chars: number;             // 1コマ合計の最大文字数（panel全部足して）
        type?: 'narration_box'|'dialogue'|'thought'|'shout'|'whisper'|'mixed';
      };
      turn_candidate: 'none'|'page_open'|'page_end'|'episode_end';  // ページめくり候補
      turn_strength: 0|1|2|3|4|5;     // 引きの強度
      source_ref?: { scene_id: string; body_offset?: [number, number] };  // 原文trace
      negative_space_hint?: string;   // ネガティブスペース指示（生成prompt + SVG配置の両方が参照）
      render_risk?: 'low'|'medium'|'high';  // 複雑な手・接触瞬間など F-2/F-1 戦略入力
    }>;
  }>;
};
`;

/**
 * 1 エピソード分のネーム（pages[] > panels[]）を構築する
 *
 * @param args.targetPages - 横読み Phase A の主入力。1話 16-26p が標準
 * @param args.targetPanels - panel 総数の目安（target_pages × avg_panels_per_page で算出）
 * @param args.genreId - 異世界なろう系3ジャンル特化プリセット (optional)
 */
export async function buildStoryboard(args: {
  episodeNum: number;
  episodeBody: string;
  plot: EpisodePlotData;
  scenes: SceneEntry[];
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
  /** 目標ページ数（KDP B6 横読み、16-26p 推奨） */
  targetPages: number;
  /** panel 総数の目安（target_pages × 5-7 ≒ 80-180） */
  targetPanels: number;
  /** 異世界なろう系3ジャンルプリセット (Phase A 検証作品向け) */
  genreId?: MangaGenreId;
  cwd?: string;
}): Promise<StoryboardPage[]> {
  const characterCards = args.characters
    .map((c) => {
      const hair = c.spec?.hair
        ? `${c.spec.hair.color}/${c.spec.hair.style}`
        : "?";
      const role = c.character_role ?? "supporting";
      return `- ${c.character_name} (${role}): hair=${hair}`;
    })
    .join("\n");

  const locationCards = args.locations
    .map((l) => `- ${l.location_name} (${l.location_type ?? "other"}): ${l.spec?.atmosphere ?? "?"}`)
    .join("\n");

  const sceneCards = args.scenes
    .map((s) =>
      [
        `### ${s.scene_id} [${s.dramatic_intent}, target_panels≈${s.suggested_panel_count}]`,
        `- 場所: ${s.location_name ?? "?"}`,
        `- 登場: ${s.characters_present.join(", ") || "?"}`,
        `- 要約: ${s.summary}`,
        `- 抜粋: ${s.body_excerpt}`,
      ].join("\n")
    )
    .join("\n\n");

  const beatCards = args.plot.beats
    .map((b) =>
      [
        `### beat ${b.beat_idx} [${b.label}, intensity=${b.emotional_intensity.toFixed(2)}]`,
        `- 要約: ${b.summary}`,
        `- key_visual: ${b.key_visual}`,
        `- scenes: ${b.scene_ids.join(", ")}`,
        `- chars: ${b.characters.join(", ") || "?"}`,
        b.page_budget
          ? `- page_budget: target=${b.page_budget.target_pages}p (min=${b.page_budget.min_pages}, max=${b.page_budget.max_pages})`
          : "",
        b.foreshadow_seed ? `- 伏線(種): ${b.foreshadow_seed}` : "",
        b.foreshadow_payoff ? `- 伏線(回収): ${b.foreshadow_payoff}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  // ジャンルプリセットがあれば systemContext 末尾に追加
  const genrePreset = args.genreId ? getGenrePreset(args.genreId) : undefined;
  const genreAddition = genrePreset
    ? [
        "",
        "=== ジャンル特化指示 ===",
        genrePreset.system_context_addition,
        "",
        `必須シーン (1巻通して登場させる): ${genrePreset.must_have_volume_1_scenes.slice(0, 4).join(" / ")}`,
        `視覚モチーフ (繰り返し描写): ${genrePreset.visual_motifs.slice(0, 5).join(" / ")}`,
      ].join("\n")
    : "";

  const mustEventsLine =
    args.plot.must_include_events && args.plot.must_include_events.length > 0
      ? `\n必須イベント (1巻スケジュール由来、本話で消化必須): ${args.plot.must_include_events.join(" / ")}`
      : "";

  const result = await extractStructuredJson<{ pages: StoryboardPage[] }>({
    systemContext: [
      "あなたは横読み白黒漫画 (B6 1748×2480 / KDP+KU) 用の「ネーム作家」です。",
      "プロット骨格・シーン分割・聖書を入力に、ページ階層構造のコマ列を構築します。",
      "出力は pages[] > panels[] のネスト。1ページに 4-8 panels (見開き/扉ページは 1-2) が標準。",
      "",
      "===== ネームの鉄則 (panel単位) =====",
      "  1. すべてのコマに『存在意義』がある — purpose / change_from_prev を埋められないコマは作らない",
      "  2. コマ間は対比・カット繋ぎ・無音・リアクションで読者の脳内補完を誘発する",
      "  3. 同じ構図・カメラを連続させない（face_close は2コマまで）",
      "  4. 各 beat に最低 1 つの silence/pause/emote コマを入れて『間』を作る",
      "  5. 1 コマ最大 2 キャラ。3 人以上は遠景/シルエット/split_panel に逃がす",
      "  6. panel description は『AがBで何かする』という機械的記述にせず、",
      "     『Aがどう感じ、何に気付き、次に何をするか』で書く（panel物語駆動）",
      "",
      "===== ページの役割 (page単位) =====",
      "  ※ 具体的なコマ割りテンプレ選択（slot rect / 大ゴマ位置 / 1ページ密度リズム）は",
      "  　 後段の page-director (L1.4) が決定する。ネーム層は『ページの物語的役割』",
      "  　 『何ページ目で何が起きるか』『ページめくりの効かせ所』だけを指示する。",
      "",
      "  page_role の使い分け:",
      "    - establishing: シーン頭。場の確立、登場人物の位置関係提示",
      "    - dialogue:     会話・関係性の展開",
      "    - action:       戦闘・アクション・移動",
      "    - reveal:       翻し・新情報の露出（前ページめくりからの応答）",
      "    - aftermath:    余韻・小休止・心情整理",
      "    - cliffhanger:  ページ末・話末の強い引き",
      "",
      "===== narrative_function の使い分け (panel単位) =====",
      "  - inform: 状況・情報の提示",
      "  - emote: キャラの内面を見せる感情ショット",
      "  - pause: 間・タメ。読者を立ち止まらせる",
      "  - contrast: 直前コマと真逆の構図/サイズ/光量で対比",
      "  - reveal: 隠されていた情報の露出（翻し）",
      "  - silence: ほぼ完全無音、余韻専用",
      "  - establishing: 場・状況の確立（シーン頭の引き画）",
      "  - beat_button: ビート締めの一発（決め画/決め台詞）",
      "  - reaction: 別キャラのリアクションショット",
      "  - cutaway: 別所への切り返し",
      "",
      "===== cut_type の使い分け（直前コマからの繋ぎ） =====",
      "  - match_action: 動作の続き / shot_reverse: 話者A→Bの顔切返し",
      "  - scale_jump: 引き⇄寄り / graphic_match: 形・構図の類似で繋ぐ",
      "  - smash_cut: 場面強制切替 / reveal_pull: 引きで何かが見える / time_skip: 時間ジャンプ",
      "",
      "===== importance (1-5) の付与基準 =====",
      "  ネーム作家として『このコマを大きく見せたい』という意図を 1-5 で表現する。",
      "  L1.4 page-director がテンプレ slot の大小決定に使う。",
      "    5: 見せ場 / 見開き / 扉ページの主役 / 必殺技決め画 / 話末 cliffhanger",
      "    4: ページの主コマ / 章節の山場 / 強い感情 beat_button",
      "    3: 普通の中型コマ / 重要だが主役ではない情報",
      "    2: 反応・繋ぎコマ",
      "    1: 小コマ・余韻・タメ",
      "  importance 4-5 は 1ページに 0-1 個が原則（多すぎると焦点が散る）。",
      "",
      "===== bubble_budget (吹き出し予算、SVG重ね前提) =====",
      "  画像内に文字は描かない。SVG で後から重ねるため、コマごとに『文字量予算』を申告する。",
      "    count: 吹き出し数（0=silent、1-2 が標準、3+ は会話濃密ページのみ）",
      "    max_chars: 1コマ合計の最大文字数（吹き出し全部足して）",
      "      - 顔アップ: 8-15字（短い決め台詞）",
      "      - 中型コマ: 15-30字",
      "      - 大ゴマ: 30-60字（説明・ナレーション可）",
      "      - silence/pause: 0-5字（効果音のみ等）",
      "    type: narration_box / dialogue / thought / shout / whisper / mixed",
      "",
      "===== turn_candidate / turn_strength (ページめくり) =====",
      "  ページめくりは漫画の『時間』を制御する最大の演出装置。",
      "  panel 単位で『このコマで読者にめくらせたい』を申告する:",
      "    - turn_candidate=none: 通常コマ",
      "    - turn_candidate=page_open: ページ頭の引き受け（前ページ末からの応答コマ）",
      "    - turn_candidate=page_end: ページ末（次ページで答えが出る／reveal前）",
      "    - turn_candidate=episode_end: 話末の cliffhanger コマ",
      "  turn_strength 0-5: 0=平坦、3=普通の引き、4=cliffhanger水準、5=見開き級の決め画",
      "  ページ末 panel は必ず turn_strength≥2、話末は ≥4。",
      "",
      "===== render_risk (描画リスク自己申告) =====",
      "  gpt-image-2 が苦手とするコマを事前に申告。L1.4 が F-2/F-1 戦略選択に使う。",
      "    - low: 単独キャラ・遠景・establishing",
      "    - medium: 2人会話・小道具操作",
      "    - high: 接触瞬間・複雑な手のアクション・3人以上の絡み",
      "  high のコマは構図を直前直後で代替するか、シルエット/split_panel に逃がすこと。",
      "",
      "===== 感情演出8技法 (1ページに最低1つ採用) =====",
      "  - 主人公独白 (雲型吹き出し)",
      "  - 派手 vs 地味のギャップ (期待 vs 現実)",
      "  - 温度差ペア (友人爆発 ⇔ 主人公冷静)",
      "  - 顔以外の部位 (足元・手・背中) で間接的感情",
      "  - 連続吹き出し (焦り・動揺)",
      "  - 写真フレーム/過去回想",
      "  - 表情の極端化 (ギャグ顔)",
      "  - silence panel (50%以上ピュアホワイト、文字なし)",
      "",
      "===== 設定説明の作法 =====",
      "  - ナレーション枠は最小限。世界観はキャラ会話で説明する",
      "  - マスコット/相棒を読者代理として『なんで?』と問わせ、別キャラが答える",
      "  - ステータス画面/SNS panel は negative_space_hint で空枠を予約 (SVG重ね前提)",
      "  - 危険警告風の注釈でテンション維持",
      "",
      "===== 場面転換 =====",
      "  - 場所転換時は最初のpanelで必ず establishing (ロケ全体引き) を入れる",
      "  - 時間転換は章扉、ニュース、季節モチーフで表現",
      genreAddition,
    ].filter(Boolean).join("\n"),
    materials: {
      plot_summary: [
        `theme: ${args.plot.theme}`,
        `arc: ${args.plot.protagonist_arc.start} → ${args.plot.protagonist_arc.turn} → ${args.plot.protagonist_arc.end}`,
        `cliffhanger: ${args.plot.cliffhanger_hook}`,
        `motifs: ${args.plot.motifs.join(", ")}`,
        `intended_experience: ${args.plot.intended_reading_experience}`,
        mustEventsLine,
      ].join("\n"),
      beats: beatCards,
      scenes: sceneCards,
      character_bibles: characterCards || "(キャラ聖書未登録)",
      location_bibles: locationCards || "(ロケ聖書未登録)",
      target_pages: String(args.targetPages),
      target_panels: String(args.targetPanels),
      episode_body_excerpt: args.episodeBody.slice(0, 4000),
    },
    instruction: [
      `第${args.episodeNum}話のネームを構築してください。`,
      `総 ${args.targetPages}±2 ページ、総 ${args.targetPanels}±10 コマ。`,
      "",
      "厳守ルール:",
      "1. 出力は pages[] > panels[] のネスト構造。pages.length は target_pages±2 を厳守する。",
      "2. page_idx は 1-indexed の連番。page_side は 1=right, 2=left, 3=right ... と RTL 横読みで交互。",
      "3. 各 beat に対して、その beat の scene_ids に属するコマを連続して並べる。beat 間にコマを混ぜない。",
      "4. 各 beat の page_budget が指定されていれば、合計ページ数を厳守する（target_pages の合計と一致）。",
      "5. すべてのコマで `purpose` `change_from_prev` `narrative_function` `visual_focus` `importance` `bubble_budget` `turn_candidate` `turn_strength` `render_risk` を必ず埋める。",
      "6. 各 beat に少なくとも 1 つの silence / pause / emote コマを置く。",
      "7. face_close を 3 コマ以上連続させない（連続2コマまで）。",
      "8. role=information の連続も2コマまで。",
      "9. dialogue.speaker_name は characters に含まれるキャラのみ。独白は narration を使う。",
      "10. 最後のページの最後のコマは role=cliffhanger / aspect=page or spread / narrative_function=beat_button / turn_candidate=episode_end / turn_strength=4-5。",
      "11. 各ページ末 panel は turn_strength≥2、reveal の直前のページ末は turn_strength≥3。",
      "12. importance 4-5 は 1ページに 0-1 個まで。",
      "13. 不明なキャラ名・ロケ名は提示リストから選び直す（新規生成禁止）。",
      "14. 必須イベント (must_include_events) が指定されている場合、本話のいずれかの panel で消化する。",
      "15. cut_type は『直前コマからの繋ぎ』として、できる限り埋める（特にカット切替・対比・引き⇄寄りの場面）。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 10 * 60 * 1000,
    maxRetries: 2,
    cwd: args.cwd,
  });

  return result.pages ?? [];
}

/**
 * StoryboardPage[] を フラットな ShotlistPanelEntry[] と StoryboardPageEntry[] に変換する
 * （名前 → UUID 解決、page_idx 紐付け）
 */
export function convertStoryboardToShotlistEntries(args: {
  pages: StoryboardPage[];
  characterNameToId: Map<string, string>;
  locationNameToId: Map<string, string>;
}): {
  entries: ShotlistPanelEntry[];
  pageEntries: StoryboardPageEntry[];
  warnings: StoryboardWarning[];
} {
  const warnings: StoryboardWarning[] = [];
  const entries: ShotlistPanelEntry[] = [];
  const pageEntries: StoryboardPageEntry[] = [];

  let panelCounter = 0;

  for (const page of args.pages) {
    const pagePanelIdxs: number[] = [];

    for (const p of page.panels ?? []) {
      panelCounter += 1;
      const idx = panelCounter;

      const characterIds: string[] = [];
      for (const name of p.characters ?? []) {
        const id = args.characterNameToId.get(name);
        if (id) characterIds.push(id);
        else
          warnings.push({
            panel_idx: idx,
            scene_id: p.scene_id,
            kind: "unknown_character",
            detail: `未登録キャラ '${name}' を panel から除外`,
          });
      }

      const positions: Record<string, PanelSpatialPosition> = {};
      if (p.character_positions) {
        for (const [name, pos] of Object.entries(p.character_positions)) {
          const id = args.characterNameToId.get(name);
          if (id) positions[id] = pos;
        }
      }

      let locationId: string | null = null;
      if (p.location) {
        const id = args.locationNameToId.get(p.location);
        if (id) locationId = id;
        else
          warnings.push({
            panel_idx: idx,
            scene_id: p.scene_id,
            kind: "unknown_location",
            detail: `未登録ロケ '${p.location}' を null へ fallback`,
          });
      }

      const dialogue = (p.dialogue ?? [])
        .map((d) => {
          const speakerId = args.characterNameToId.get(d.speaker_name);
          if (!speakerId) {
            warnings.push({
              panel_idx: idx,
              scene_id: p.scene_id,
              kind: "unknown_speaker",
              detail: `未登録話者 '${d.speaker_name}' のセリフを除外: "${d.text.slice(0, 30)}"`,
            });
            return null;
          }
          return {
            speaker_id: speakerId,
            text: d.text,
            intent: d.intent,
            bubble_type: d.bubble_type,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      if (!p.purpose) {
        warnings.push({
          panel_idx: idx,
          scene_id: p.scene_id,
          kind: "missing_purpose",
          detail: "purpose 未記入",
        });
      }
      if (!p.change_from_prev) {
        warnings.push({
          panel_idx: idx,
          scene_id: p.scene_id,
          kind: "missing_change_from_prev",
          detail: "change_from_prev 未記入",
        });
      }

      // bubble_budget の整合性チェック (count=0 だが dialogue がある等)
      const dialogueChars = (p.dialogue ?? []).reduce(
        (sum, d) => sum + (d.text?.length ?? 0),
        0
      );
      const narrationChars = p.narration?.length ?? 0;
      const totalChars = dialogueChars + narrationChars;
      if (
        p.bubble_budget &&
        totalChars > p.bubble_budget.max_chars + 5
      ) {
        warnings.push({
          panel_idx: idx,
          scene_id: p.scene_id,
          kind: "bubble_budget_violation",
          detail: `実テキスト ${totalChars} 字 > 予算 ${p.bubble_budget.max_chars} 字`,
        });
      }

      entries.push({
        idx,
        role: p.role,
        aspect: p.aspect,
        scene_id: p.scene_id,
        beat_idx: p.beat_idx,
        camera: p.camera,
        tempo: p.tempo,
        characters: characterIds,
        character_positions:
          Object.keys(positions).length > 0 ? positions : undefined,
        location: locationId,
        narration: p.narration,
        dialogue: dialogue.length > 0 ? dialogue : undefined,
        emotion: p.emotion,
        scroll_pause_intent: p.scroll_pause_intent,
        multi_character_treatment: p.multi_character_treatment,
        narrative_function: p.narrative_function,
        purpose: p.purpose,
        change_from_prev: p.change_from_prev,
        link_to_next: p.link_to_next,
        reader_reaction_intended: p.reader_reaction_intended,
        visual_focus: p.visual_focus,
        cut_type: p.cut_type,
        // Phase A 追加
        page_idx: page.page_idx,
        importance: p.importance,
        bubble_budget: p.bubble_budget,
        turn_candidate: p.turn_candidate,
        turn_strength: p.turn_strength,
        source_ref: p.source_ref ?? { scene_id: p.scene_id },
        negative_space_hint: p.negative_space_hint,
        render_risk: p.render_risk,
      });

      pagePanelIdxs.push(idx);
    }

    pageEntries.push({
      page_idx: page.page_idx,
      page_side: page.page_side,
      page_role: page.page_role,
      target_panels: page.target_panels,
      page_open_hook: page.page_open_hook,
      page_end_hook: page.page_end_hook,
      turn_strength: page.turn_strength,
      panel_idxs: pagePanelIdxs,
    });
  }

  return { entries, pageEntries, warnings };
}

/**
 * 連続 face_close / silence panel 不在 / 多キャラ違反 / importance 4-5 不足 /
 * 話末 cliffhanger 弱 / 必須イベント未消化 を検出
 */
export function validateStoryboard(
  entries: ShotlistPanelEntry[],
  beatCount: number,
  options?: {
    targetPages?: number;
    actualPages?: number;
    mustIncludeEvents?: string[];
  }
): { entries: ShotlistPanelEntry[]; warnings: StoryboardWarning[] } {
  const warnings: StoryboardWarning[] = [];
  const fixed = entries.map((e) => ({ ...e }));

  // 1) 多キャラ violation 自動補正
  for (const e of fixed) {
    if (e.characters.length > 2) {
      if (!e.multi_character_treatment || e.multi_character_treatment === "normal") {
        e.multi_character_treatment = "distant";
      }
      warnings.push({
        panel_idx: e.idx,
        scene_id: e.scene_id,
        kind: "too_many_characters",
        detail: `${e.characters.length}キャラ。treatment=${e.multi_character_treatment}`,
      });
    }
  }

  // 2) face_close 連続自動切替
  let faceCloseRun = 0;
  for (const e of fixed) {
    if (e.camera === "face_close") {
      faceCloseRun += 1;
      if (faceCloseRun > 2) {
        warnings.push({
          panel_idx: e.idx,
          scene_id: e.scene_id,
          kind: "consecutive_face_close",
          detail: `${faceCloseRun}コマ連続 face_close → over_shoulder へ自動切替`,
        });
        e.camera = "over_shoulder";
        faceCloseRun = 0;
      }
    } else {
      faceCloseRun = 0;
    }
  }

  // 3) 各 beat で silence/pause/emote 系が最低 1 つあるか
  const presencePerBeat = new Map<number, boolean>();
  for (const e of fixed) {
    if (e.beat_idx == null) continue;
    const ok =
      e.narrative_function === "silence" ||
      e.narrative_function === "pause" ||
      e.narrative_function === "emote";
    if (ok) presencePerBeat.set(e.beat_idx, true);
  }
  for (let b = 1; b <= beatCount; b++) {
    if (!presencePerBeat.get(b)) {
      const sample = fixed.find((e) => e.beat_idx === b);
      if (sample) {
        warnings.push({
          panel_idx: sample.idx,
          scene_id: sample.scene_id,
          kind: "missing_silence_panel",
          detail: `beat ${b} に silence/pause/emote コマが無い`,
        });
      }
    }
  }

  // 4) information 連続も警告（自動補正なし）
  let infoRun = 0;
  for (const e of fixed) {
    if (e.role === "information") {
      infoRun += 1;
      if (infoRun > 2) {
        warnings.push({
          panel_idx: e.idx,
          scene_id: e.scene_id,
          kind: "consecutive_information",
          detail: `${infoRun}コマ連続 information`,
        });
      }
    } else {
      infoRun = 0;
    }
  }

  // 5) ページ数 drift
  if (options?.targetPages != null && options.actualPages != null) {
    const drift = Math.abs(options.actualPages - options.targetPages);
    if (drift > 2) {
      warnings.push({
        panel_idx: 0,
        scene_id: "(episode)",
        kind: "page_count_drift",
        detail: `目標 ${options.targetPages}p / 実際 ${options.actualPages}p (drift=${drift})`,
      });
    }
  }

  // 6) importance 4-5 密度（24p で <8 panels なら警告）
  const totalPanels = fixed.length;
  if (totalPanels > 0) {
    const high = fixed.filter(
      (e) => (e.importance ?? 3) >= 4
    ).length;
    const expectedHigh = Math.max(4, Math.floor(totalPanels / 12));
    if (high < expectedHigh) {
      warnings.push({
        panel_idx: 0,
        scene_id: "(episode)",
        kind: "low_importance_density",
        detail: `importance≥4 が ${high}コマ (期待 ${expectedHigh}+)。見せ場が不足`,
      });
    }
  }

  // 7) 話末 cliffhanger 強度
  const last = fixed[fixed.length - 1];
  if (last) {
    const ts = last.turn_strength ?? 0;
    if (ts < 4) {
      warnings.push({
        panel_idx: last.idx,
        scene_id: last.scene_id,
        kind: "weak_episode_cliffhanger",
        detail: `話末 panel turn_strength=${ts} < 4。引きが弱い`,
      });
    }
  }

  // 8) 必須イベント消化チェック (purpose / narration / dialogue にイベント名が含まれるか粗判定)
  if (options?.mustIncludeEvents && options.mustIncludeEvents.length > 0) {
    const corpus = fixed
      .map((e) =>
        [
          e.purpose ?? "",
          e.narration ?? "",
          e.visual_focus ?? "",
          ...(e.dialogue?.map((d) => d.text) ?? []),
        ].join(" ")
      )
      .join("\n");
    for (const evt of options.mustIncludeEvents) {
      if (!corpus.includes(evt)) {
        warnings.push({
          panel_idx: 0,
          scene_id: "(episode)",
          kind: "missing_must_event",
          detail: `必須イベント '${evt}' が本話のネームに見当たらない`,
        });
      }
    }
  }

  return { entries: fixed, warnings };
}
