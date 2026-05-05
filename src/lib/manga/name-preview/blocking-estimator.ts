/**
 * 疑似 blocking 推定
 *
 * v1 では PanelV2.entities から「画面内のキャラ配置・吹き出し位置」を
 * 決定論で推定する。L4 storyboard schema に正式な blocking field を
 * 追加するのは v2 以降。
 *
 * 右綴じ漫画前提: speaker は右側、listener は左側、focus_entity は中央。
 * これは商業漫画の「アクション線が右→左に流れる」原則の擬似再現。
 */
import type { PanelV2 } from "../schemas-v2";

export type BlockingZone = "left" | "center" | "right";
export type BubbleZone =
  | "top_left"
  | "top_right"
  | "mid_left"
  | "mid_right"
  | "bottom";

export type EstimatedBlocking = {
  /** 左/中央/右 ゾーンに配置されるキャラ ID */
  zones: Record<BlockingZone, string[]>;
  /** focus entity (キャラ/ロケ/小物の id) を強調するゾーン */
  focus_zone: BlockingZone;
  /** 吹き出しが入るゾーン (台詞数で決まる) */
  bubble_zones: BubbleZone[];
  /** silhouette 扱い (background role + 多人数時の脇役) */
  silhouette_ids: string[];
};

/**
 * speaker 優先 → 右側
 * listener → 左側
 * background / silhouette → 中央背後
 * focus_entity が登場キャラ → そのキャラの zone を focus に
 *
 * 多人数時 (3+) は focus 以外の同 role が混在 → silhouette_ids へ
 */
export function estimateBlocking(panel: PanelV2): EstimatedBlocking {
  const zones: Record<BlockingZone, string[]> = {
    left: [],
    center: [],
    right: [],
  };
  const silhouette_ids: string[] = [];

  const characters = panel.entities.characters;
  const focusId = panel.entities.focus_entity_id;

  // 役割で振り分け
  const speakers = characters.filter((c) => c.role === "speaker");
  const listeners = characters.filter((c) => c.role === "listener");
  const others = characters.filter((c) => c.role === "background" || c.role === "silhouette");

  // 多人数時の脇役判定: focus 以外で同 role が 2+ 居たら背景化
  if (characters.length >= 3) {
    for (const c of [...speakers, ...listeners, ...others]) {
      if (c.character_id !== focusId && c.role !== "speaker") {
        silhouette_ids.push(c.character_id);
      }
    }
  }

  // 右綴じ前提: 重要 = 右
  for (const c of speakers) {
    if (silhouette_ids.includes(c.character_id)) zones.center.push(c.character_id);
    else zones.right.push(c.character_id);
  }
  for (const c of listeners) {
    if (silhouette_ids.includes(c.character_id)) zones.center.push(c.character_id);
    else zones.left.push(c.character_id);
  }
  for (const c of others) {
    zones.center.push(c.character_id);
  }

  // focus zone 決定
  let focus_zone: BlockingZone = "center";
  if (focusId.startsWith("char_")) {
    if (zones.right.includes(focusId)) focus_zone = "right";
    else if (zones.left.includes(focusId)) focus_zone = "left";
    else focus_zone = "center";
  }

  // 吹き出しゾーン: 台詞 + モノローグ + ナレーション の合計から推定
  const totalBubbles =
    panel.dialogue.length + panel.monologue.length + panel.narration.length;
  const bubble_zones: BubbleZone[] = [];
  if (panel.silence) {
    // silence なら吹き出しなし、SFX のみあり得る
  } else if (totalBubbles >= 1) {
    if (panel.dialogue.length >= 1) {
      // speaker が右なら top_right、左なら top_left
      const speakerSide: BlockingZone =
        zones.right.length > 0 ? "right" : zones.left.length > 0 ? "left" : "center";
      bubble_zones.push(speakerSide === "right" ? "top_right" : "top_left");
    }
    if (panel.monologue.length >= 1) {
      bubble_zones.push("mid_left"); // モノローグは画面左 (心の声)
    }
    if (panel.narration.length >= 1) {
      bubble_zones.push("bottom"); // ナレーションはコマ底
    }
  }

  return { zones, focus_zone, bubble_zones, silhouette_ids };
}
