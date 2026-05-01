/**
 * ショットプランナー
 *
 * シーン分割 + キャラ聖書 + ロケ聖書 + リズム曲線 を入力に、
 * 縦読み漫画 1 話分のパネル列（30-50 枚目安）を計画する。
 *
 * Codex CLI 経由（ANTHROPIC_API_KEY 課金前提にしない原則）。
 *
 * 重要制約（プラン本体・Codex 3度のレビュー指摘）:
 * - 1パネル最大2キャラ。3人以上は遠景/シルエット/分割コマで逃がす
 * - LLM はキャラ名・ロケ名で出力、UUID 変換は本モジュールが行う
 * - 連続する顔アップは2コマまで（後の validateAndFix で違反検出）
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
} from "../types";
import type { ShotlistPanelEntry } from "../schemas";
import type { SceneEntry } from "./scene-splitter";

/** LLM が出力する生パネル（名前ベース、UUID 未変換） */
export type PlannedPanel = {
  scene_id: string;
  role: PanelRole;
  aspect: PanelAspect;
  camera: PanelCamera;
  tempo: "fast" | "slow" | "stop";
  /** キャラ名（character_bibles.character_name と一致を期待） */
  characters: string[];
  character_positions?: Record<string, PanelSpatialPosition>;
  /** ロケ名（location_bibles.location_name と一致を期待） */
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
};

/** プラン → 検証ログ */
export type PlanWarning = {
  panel_idx: number;
  scene_id: string;
  kind:
    | "too_many_characters"
    | "unknown_character"
    | "unknown_location"
    | "unknown_speaker"
    | "consecutive_face_close"
    | "missing_treatment"
    | "panel_count_drift";
  detail: string;
};

const SCHEMA = `
type Plan = {
  panels: Array<{
    scene_id: string;       // SceneEntry.scene_id を厳密に流用（ep1-s1 等）
    role: 'opening'|'emotion'|'information'|'action'|'transition'|'cliffhanger';
    aspect: 'vertical'|'square'|'big'|'splash';
    camera: 'face_close'|'full_body'|'over_shoulder'|'birds_eye'|'hands'|'wide'|'side';
    tempo: 'fast'|'slow'|'stop';
    characters: string[];   // キャラ聖書名で。最大2人。3人以上は multi_character_treatment を distant/silhouette/split_panel に
    character_positions?: Record<string, 'left'|'center'|'right'|'foreground'|'background'>;
    location: string | null;  // ロケ聖書名 or null
    narration?: string;
    dialogue?: Array<{
      speaker_name: string;
      text: string;
      intent?: string;
      bubble_type?: 'normal'|'thought'|'shout'|'whisper'|'narration';
    }>;
    emotion?: string;
    scroll_pause_intent?: number;
    multi_character_treatment?: 'normal'|'distant'|'silhouette'|'split_panel';
  }>;
};
`;

/**
 * 1 エピソード分のパネル列を計画する
 */
export async function planShots(args: {
  episodeNum: number;
  episodeBody: string;
  scenes: SceneEntry[];
  rhythmCurve: number[];
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
  /** 目標パネル数（30-50） */
  targetPanelCount?: number;
  cwd?: string;
}): Promise<PlannedPanel[]> {
  const targetPanels = args.targetPanelCount ?? 40;

  const characterCards = args.characters
    .map((c) => {
      const hair = c.spec?.hair
        ? `${c.spec.hair.color}/${c.spec.hair.style}`
        : "?";
      const outfit = c.spec?.outfit_default?.top ?? "?";
      return `- ${c.character_name} (${c.character_role ?? "supporting"}): hair=${hair}, outfit=${outfit}`;
    })
    .join("\n");

  const locationCards = args.locations
    .map((l) => {
      const atmosphere = l.spec?.atmosphere ?? "?";
      return `- ${l.location_name} (${l.location_type ?? "other"}): ${atmosphere}`;
    })
    .join("\n");

  const sceneCards = args.scenes
    .map((s, i) => {
      const intensity = (args.rhythmCurve[i] ?? s.intensity_hint).toFixed(2);
      return [
        `### ${s.scene_id} [${s.dramatic_intent}, intensity=${intensity}, target_panels=${s.suggested_panel_count}]`,
        `- 場所: ${s.location_name ?? "?"}`,
        `- 登場: ${s.characters_present.join(", ") || "?"}`,
        `- 要約: ${s.summary}`,
        `- 抜粋: ${s.body_excerpt}`,
      ].join("\n");
    })
    .join("\n\n");

  const result = await extractStructuredJson<{ panels: PlannedPanel[] }>({
    systemContext: [
      "あなたは縦読み漫画用の「ショットプランナー」です。",
      "シーン分割・キャラ聖書・ロケ聖書・リズム曲線を入力に、",
      "1話分のパネル列（30-50 枚目安）を計画します。",
      "縦読み演出の鉄則:",
      "  - 1パネル最大2キャラ。3人以上は遠景・シルエット・分割コマで逃がす",
      "  - 連続する face_close は2コマまで（読者疲労）",
      "  - 引きパネル（cliffhanger）は big/splash で大ゴマ＋短い決め台詞",
      "  - 情報パネル (role=information) はテンポ slow、感情パネルは tempo に応じて緩急",
    ].join("\n"),
    materials: {
      character_bibles: characterCards || "(キャラ聖書未登録)",
      location_bibles: locationCards || "(ロケ聖書未登録)",
      rhythm_curve: args.rhythmCurve.map((v) => v.toFixed(2)).join(", "),
      scenes: sceneCards,
      target_panel_count: String(targetPanels),
      episode_body_excerpt: args.episodeBody.slice(0, 4000),
    },
    instruction: [
      `第${args.episodeNum}話のパネル列を計画してください。総パネル数は ${targetPanels}±5 を目標。`,
      "",
      "重要なルール:",
      "1. 各パネルの scene_id は提示した SceneEntry.scene_id を厳密に流用すること（新規発明禁止）。",
      "2. パネルは scene_id 順に並べ、各シーンの suggested_panel_count に概ね合わせる。",
      "3. characters は character_bibles の名前で、最大2名。",
      "   3名以上が同時に映るシーンは multi_character_treatment を 'distant' か 'silhouette' か 'split_panel' に設定し、",
      "   characters は写る代表 1-2 名のみに絞る。",
      "4. dialogue.speaker_name は characters に含まれるキャラのみ（または独白なら narration を使う）。",
      "5. role の配分目安: opening 1, cliffhanger 1, emotion 30%, information 15%, action 30%, transition 15% 程度。",
      "6. aspect: 重要シーン・引きは big/splash、普通は vertical、情報・タメは square。",
      "7. 連続 face_close は2コマまで。3コマ目は full_body / over_shoulder / wide に切り替える。",
      "8. 最後のパネルは role=cliffhanger / aspect=big or splash / 強い決め台詞 or 表情。",
      "9. tempo: action=fast、emotion=slow、cliffhanger=stop が基本。",
      "10. 不明なキャラ名・ロケ名は提示リストから選び直す（新規生成しない）。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 7 * 60 * 1000,
    maxRetries: 2,
    cwd: args.cwd,
  });

  return result.panels ?? [];
}

/**
 * PlannedPanel → ShotlistPanelEntry へ変換（名前 → UUID 解決）
 *
 * 未知のキャラ・ロケはサイレントに drop し warnings に積む。
 */
export function convertToShotlistEntries(args: {
  panels: PlannedPanel[];
  characterNameToId: Map<string, string>;
  locationNameToId: Map<string, string>;
}): { entries: ShotlistPanelEntry[]; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  const entries: ShotlistPanelEntry[] = [];

  args.panels.forEach((p, i) => {
    const idx = i + 1;

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

    entries.push({
      idx,
      role: p.role,
      aspect: p.aspect,
      scene_id: p.scene_id,
      camera: p.camera,
      tempo: p.tempo,
      characters: characterIds,
      character_positions: Object.keys(positions).length > 0 ? positions : undefined,
      location: locationId,
      narration: p.narration,
      dialogue: dialogue.length > 0 ? dialogue : undefined,
      emotion: p.emotion,
      scroll_pause_intent: p.scroll_pause_intent,
      multi_character_treatment: p.multi_character_treatment,
    });
  });

  return { entries, warnings };
}

/**
 * 連続 face_close、3キャラ以上で treatment 未設定、などの違反を検出して自動補正する。
 * 補正できない違反は warnings に積む。
 */
export function validateAndFix(
  entries: ShotlistPanelEntry[]
): { entries: ShotlistPanelEntry[]; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  const fixed = entries.map((e) => ({ ...e }));

  // 1) 3キャラ以上で treatment が未設定 or 'normal' なら 'distant' に強制
  for (const e of fixed) {
    if (
      e.characters.length > 2 &&
      (!e.multi_character_treatment || e.multi_character_treatment === "normal")
    ) {
      warnings.push({
        panel_idx: e.idx,
        scene_id: e.scene_id,
        kind: "missing_treatment",
        detail: `${e.characters.length}キャラ同時、treatment を 'distant' に強制設定`,
      });
      e.multi_character_treatment = "distant";
    }
    if (e.characters.length > 2) {
      warnings.push({
        panel_idx: e.idx,
        scene_id: e.scene_id,
        kind: "too_many_characters",
        detail: `${e.characters.length}キャラ。treatment=${e.multi_character_treatment}`,
      });
    }
  }

  // 2) 連続 face_close は2コマまで
  let faceCloseRun = 0;
  for (const e of fixed) {
    if (e.camera === "face_close") {
      faceCloseRun += 1;
      if (faceCloseRun > 2) {
        warnings.push({
          panel_idx: e.idx,
          scene_id: e.scene_id,
          kind: "consecutive_face_close",
          detail: `${faceCloseRun}コマ連続 face_close。over_shoulder へ自動切替`,
        });
        e.camera = "over_shoulder";
        faceCloseRun = 0;
      }
    } else {
      faceCloseRun = 0;
    }
  }

  return { entries: fixed, warnings };
}
