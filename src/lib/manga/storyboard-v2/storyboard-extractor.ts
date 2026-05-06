/**
 * L4 Storyboard v2 — shotlist + bible → episodes/epNN/storyboard.json
 *
 * panel skeleton に dialogue/monologue/narration/sfx/expression を肉付けする。
 * entity_id binding は L3 で確定済み、ここでは意味的な ネーム を補強する。
 */
import { extractStructuredJson } from "../llm/codex-text";
import { buildCraftGuideDirectives } from "./craft-guide-directives";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PanelV2,
  PageRoleV2,
} from "../schemas-v2";
import type { ShotlistV2 } from "../shotlist-v2/scene-extractor";

const STORYBOARD_SCHEMA = `
type StoryboardOutput = {
  total_pages: number;
  pages: Array<{
    page_no: number;
    page_role: "opening_hook" | "buildup" | "reveal" | "cliffhanger" | "aftermath" | "establishing" | "dialogue" | "action";
    panel_ids: string[];     // shotlist.panels[].panel_id を 1ページ分だけ列挙
  }>;
  panels_extra: Array<{
    panel_id: string;        // shotlist.panels[].panel_id と一致
    reading_order: number;   // ページ内 RTL 読み順 (1-indexed)
    expression_per_character: Record<string, string>;  // character_id => 表情
    on_screen_via_per_character: Record<string, "in_person" | "tv" | "photo" | "phone">;
    role_per_character: Record<string, "speaker" | "listener" | "background" | "silhouette">;
    action: string;
    dialogue: Array<{ character_id: string; text: string }>;
    monologue: Array<{ character_id: string; text: string }>;
    narration: string[];
    sfx: string[];
  }>;
};
`;

export async function extractStoryboardFromShotlist(args: {
  bible: BibleSnapshotV2;
  shotlist: ShotlistV2;
  panelsPerPageRange?: { min: number; max: number };
  avgPanelsPerPage?: number;
  cwd?: string;
  timeoutMs?: number;
}): Promise<EpisodeStoryboardV2> {
  const { bible, shotlist } = args;
  const range = args.panelsPerPageRange ?? { min: 4, max: 7 };
  const avg = args.avgPanelsPerPage ?? 5;

  const charsBlock = bible.characters
    .map((c) => `- ${c.id} :: ${c.name} (${c.role})`)
    .join("\n");
  const locsBlock = bible.locations
    .map((l) => `- ${l.id} :: ${l.name}`)
    .join("\n");

  const result = await extractStructuredJson<{
    total_pages: number;
    pages: Array<{ page_no: number; page_role: string; panel_ids: string[] }>;
    panels_extra: Array<{
      panel_id: string;
      reading_order: number;
      expression_per_character: Record<string, string>;
      on_screen_via_per_character: Record<string, string>;
      role_per_character: Record<string, string>;
      action: string;
      dialogue: Array<{ character_id: string; text: string }>;
      monologue: Array<{ character_id: string; text: string }>;
      narration: string[];
      sfx: string[];
    }>;
  }>({
    systemContext: [
      "あなたはB6判 KDP 横読み白黒漫画のストーリーボード (ネーム) エージェントです。",
      "shotlist の panel skeleton に対して、ページ割り + 各 panel の dialogue/monologue/narration/sfx/expression を生成します。",
      "",
      "重要ルール:",
      "- character_id は必ず bible に存在するもの。新しい人物・自由文字列は禁止。",
      "- セリフは『ナレーション/モノローグ/対話/SFX』のいずれかに分類。混ぜない。",
      "- 1コマあたり吹き出し合計 0-2 個、合計文字数 80字以内。",
      "- silence=true の panel は dialogue/monologue/narration/sfx すべて空配列。",
      `- 各ページの panel_count は ${range.min}〜${range.max} の範囲で variation を付ける。固定 N の monotonous な配分は商業漫画的に NG。`,
      `- 配分目安: cliffhanger / 強い見せ場 = ${range.min}〜${avg - 1} (大ゴマ多用), 対話・説明・密度ページ = ${avg + 1}〜${range.max} (情報密度高め), 標準 = ${avg} 中心。`,
      "- 22ページ目標で全 page の panel_count が同じ値に偏ることは禁止。最低 3 種類の panel_count を使う。",
      "- ページ末 (cliffhanger / page_end_hook) は重要 panel を最後に置く。",
      "",
      // Phase X WX-3 で追加: craft 知見を tone_profile / genre に応じて注入
      buildCraftGuideDirectives(
        bible.meta.tone_profile,
        bible.meta.genre,
        bible.meta.subtype,
      ),
    ].join("\n"),
    materials: {
      bible_meta: JSON.stringify(bible.meta, null, 2),
      characters: charsBlock,
      locations: locsBlock,
      style_directives: JSON.stringify(bible.style_directives, null, 2),
      visual_motifs: JSON.stringify(bible.visual_motifs, null, 2),
      shotlist_scenes: JSON.stringify(shotlist.scenes, null, 2),
      shotlist_panels: JSON.stringify(shotlist.panels, null, 2),
    },
    instruction: [
      `第${shotlist.episode_no}話の storyboard を構築してください。`,
      `総ページ数 ${shotlist.total_pages_target}、総コマ数 ${shotlist.total_panels}。`,
      "pages[] には全 panel_id を漏れなくページに配置。pages を panel_no 昇順を保ちつつ RTL でめくり推奨。",
      "panels_extra[] には全 panel_id について 1 entry。",
    ].join("\n"),
    outputSchema: STORYBOARD_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 10 * 60 * 1000,
    maxRetries: 2,
  });

  // shotlist と panels_extra を merge して PanelV2 を組み立てる
  const skeletonByPanelId = new Map(shotlist.panels.map((p) => [p.panel_id, p]));
  const extraByPanelId = new Map(result.panels_extra.map((e) => [e.panel_id, e]));

  const fullPanels: Map<string, PanelV2> = new Map();
  for (const sk of shotlist.panels) {
    const extra = extraByPanelId.get(sk.panel_id);
    if (!extra) {
      throw new Error(`panel ${sk.panel_id} は panels_extra に存在しません`);
    }

    // 1) shotlist に居るキャラを base entities に
    const entityChars = sk.involved_character_ids.map((cid) => ({
      character_id: cid,
      role: (extra.role_per_character[cid] ?? "speaker") as "speaker" | "listener" | "background" | "silhouette",
      on_screen_via: (extra.on_screen_via_per_character[cid] ?? "in_person") as "in_person" | "tv" | "photo" | "phone" | "voice_off",
      expression: extra.expression_per_character[cid] ?? "neutral",
    }));

    // 2) dialogue/monologue 話者で entities に居ない者は voice_off で自動追加
    const presentIds = new Set(entityChars.map((c) => c.character_id));
    const dialogueSpeakers = sk.silence ? [] : extra.dialogue;
    const monologueSpeakers = sk.silence ? [] : extra.monologue;
    for (const d of [...dialogueSpeakers, ...monologueSpeakers]) {
      if (!presentIds.has(d.character_id)) {
        entityChars.push({
          character_id: d.character_id,
          role: "speaker",
          on_screen_via: "voice_off",
          expression: "off_screen",
        });
        presentIds.add(d.character_id);
      }
    }

    const panel: PanelV2 = {
      panel_id: sk.panel_id,
      panel_no: sk.panel_no,
      reading_order: extra.reading_order,
      shot_type: sk.shot_type,
      camera: sk.camera,
      bleed: sk.bleed,
      silence: sk.silence,
      importance: sk.importance,
      entities: {
        characters: entityChars,
        location_id: sk.location_id,
        props: sk.prop_ids.map((pid) => ({ prop_id: pid })),
        focus_entity_id: sk.focus_entity_id,
      },
      action: extra.action,
      key_visual: sk.key_visual,
      dialogue: sk.silence ? [] : extra.dialogue,
      monologue: sk.silence ? [] : extra.monologue,
      narration: sk.silence ? [] : extra.narration,
      sfx: sk.silence ? [] : extra.sfx,
    };
    fullPanels.set(sk.panel_id, panel);
  }

  const pagesV2 = result.pages.map((p) => ({
    page_no: p.page_no,
    page_role: p.page_role as PageRoleV2,
    panels: p.panel_ids.map((pid) => {
      const panel = fullPanels.get(pid);
      if (!panel) throw new Error(`page ${p.page_no} で未知 panel_id "${pid}"`);
      return panel;
    }),
  }));

  return {
    schema_version: 2,
    episode_id: shotlist.episode_id,
    total_pages: result.total_pages,
    pages: pagesV2,
  };
}

// ============================================================
// Validation: entity_id binding hard required
// ============================================================

export function validateStoryboardEntityBinding(
  storyboard: EpisodeStoryboardV2,
  bible: BibleSnapshotV2
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const charSet = new Set(bible.characters.map((c) => c.id));
  const locSet = new Set(bible.locations.map((l) => l.id));
  const propSet = new Set(bible.props.map((p) => p.id));

  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      for (const ch of panel.entities.characters) {
        if (!charSet.has(ch.character_id)) {
          errors.push(`page ${page.page_no} panel ${panel.panel_id}: unknown character_id "${ch.character_id}"`);
        }
      }
      if (!locSet.has(panel.entities.location_id)) {
        errors.push(`page ${page.page_no} panel ${panel.panel_id}: unknown location_id "${panel.entities.location_id}"`);
      }
      for (const pr of panel.entities.props) {
        if (!propSet.has(pr.prop_id)) {
          errors.push(`page ${page.page_no} panel ${panel.panel_id}: unknown prop_id "${pr.prop_id}"`);
        }
      }
      const focusOk =
        charSet.has(panel.entities.focus_entity_id) ||
        locSet.has(panel.entities.focus_entity_id) ||
        propSet.has(panel.entities.focus_entity_id);
      if (!focusOk) {
        errors.push(`page ${page.page_no} panel ${panel.panel_id}: unknown focus_entity_id "${panel.entities.focus_entity_id}"`);
      }
      // dialogue speaker は characters[] に含まれていなければならない
      const panelCharIds = new Set(panel.entities.characters.map((c) => c.character_id));
      for (const d of panel.dialogue) {
        if (!panelCharIds.has(d.character_id)) {
          errors.push(`page ${page.page_no} panel ${panel.panel_id}: dialogue speaker "${d.character_id}" not in panel.characters`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
