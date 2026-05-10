import { describe, expect, it, vi } from "vitest";
import type {
  BibleSnapshotV2,
  PanelV2,
  ResolvedRefPacket,
} from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";
import type {
  Blocklist,
  FalsePositives,
} from "../compliance/types";
import {
  composePanelPrompt,
  extractForbiddenKeywords,
  validateAgainstCompliance,
  validatePanelText,
  validatePromptAgainstCompliance,
} from "./prompt-composer-v2";

function bible(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-06T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "test",
      title: "test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 22,
    },
    world: {
      premise: "",
      rules: [],
      system: "",
      timeline: "",
      factions: [],
      lexicon: {
        forbidden_terms_global: [
          "世界記録 (単独使用 / records.synonyms_forbidden_in_isolation)",
          "冒険者 / ダイバー / ハンター",
        ],
      },
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生 レン",
        role: "protagonist",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
    ],
    locations: [
      {
        id: "loc_dungeon",
        name: "新宿第三1F",
        location_type: "dungeon",
        spec: {},
        continuity_anchors: [],
        appears_in_episodes: [1],
      },
    ],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "manga", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "", summary: "" },
  } as unknown as BibleSnapshotV2;
}

function panel(text: string): PanelV2 {
  return {
    panel_id: "p1",
    panel_no: 1,
    reading_order: 1,
    shot_type: "close",
    camera: "eye_level",
    bleed: false,
    silence: false,
    importance: 3,
    entities: {
      characters: [
        {
          character_id: "char_ren",
          role: "speaker",
          on_screen_via: "in_person",
          expression: "neutral",
        },
      ],
      location_id: "loc_dungeon",
      props: [],
      focus_entity_id: "char_ren",
    },
    action: "レンが考える",
    key_visual: "表情",
    dialogue: [{ character_id: "char_ren", text }],
    monologue: [],
    narration: [],
    sfx: [],
  } as unknown as PanelV2;
}

const packet: ResolvedRefPacket = {
  panel_id: "p1",
  refs: [],
  warnings: [],
} as unknown as ResolvedRefPacket;

type PromptSceneForTest = Pick<
  Scene,
  "beat_type" | "location_id" | "mode" | "key_visual_intent" | "time_axis" | "cast"
> & {
  visual_motif_anchors?: Array<{ motif_name?: string; intensity?: number }>;
};

function brokerBible(): BibleSnapshotV2 {
  const b = bible();
  b.style_directives = {
    global: "manga global directive",
    scene_overrides: {
      dialogue: "Use restrained dialogue pacing with clean bubble staging and quiet close-up acting.",
    },
    overlay_rules: [],
  };
  b.world.premise = "新宿地下の異常空間が日常のすぐ下に広がっている。";
  b.world.rules = [
    "loc_dungeonでは壁面の古い案内板が現実の駅構内と異常空間の境界を示す。",
  ];
  b.world.power_system_logic = "視界に入った情報だけが能力表示として成立する。";
  b.characters = [
    {
      id: "char_ren",
      name: "桐生 レン",
      role: "protagonist",
      spec: {
        hair: { color: "black", style: "messy short", specific: "left fringe" },
        eyes: { color: "dark", shape: "sharp", expression_default: "guarded" },
        outfit_default: { outerwear: "plain hoodie", top: "white tee" },
        personality_visual: "always watches exits before people",
      },
      appearance_notes:
        "Lean teenage protagonist with tired eyes, a guarded mouth, and a habit of keeping one shoulder slightly raised.",
      psychology_deep:
        "レン treats every promise as a possible trap, but he still notices small signs of fear in others before he notices his own fatigue.",
      backstory:
        "A failed rescue attempt taught him to distrust heroic speeches, so his kindness appears as practical action rather than warmth.",
      defense_mechanisms:
        "He jokes dryly when cornered and checks exits before answering personal questions.",
      worldview_filter:
        "He reads rooms as risk maps: doorways, hands, reflections, and the distance to cover.",
      speech_style: {
        first_person: "俺",
        register: "plain guarded",
        sentence_rhythm: "short, clipped, rarely decorative",
        monologue_signature: "observational self-correction",
      },
      voice_samples: [
        { line: "まだ決めるな。見えてないものがある。", intent: "caution", episode_or_scene_hint: "episode 5" },
        { line: "助ける。けど、信じたわけじゃない。", intent: "reluctant aid" },
      ],
      attribute_classifier: { silhouette: "lean", gaze: "guarded" },
      continuity_anchors: ["left fringe", "guarded eyes", "plain hoodie silhouette"],
      appears_in_volumes: [1],
      relationship_per_partner: [],
      growth_per_volume: [
        { volume: 1, description: "自分だけで抱え込む癖を少しずつほどく。" },
      ],
    },
  ] as unknown as BibleSnapshotV2["characters"];
  b.locations = [
    {
      id: "loc_dungeon",
      name: "新宿第三1F",
      location_type: "dungeon",
      spec: {
        atmosphere: "wet concrete and station-sign unease",
        lighting_default: "broken fluorescent strips",
        visual_description:
          "A dungeon corridor that still resembles an underground station, with chipped tile walls, emergency lights, damp floor reflections, and unreadable old platform signs.",
        sensory_textures: "distant dripping water, electric buzz, cold air",
        iconic_objects: [
          { name: "old guide sign", description: "half-peeled arrows pointing to impossible exits" },
        ],
      },
      continuity_anchors: ["chipped tiles", "broken fluorescent strips"],
      appears_in_episodes: [1, 5],
    },
  ] as unknown as BibleSnapshotV2["locations"];
  b.costumes = [
    {
      id: "costume_ren_ep5",
      character_id: "char_ren",
      valid_from_episode: 5,
      valid_until_episode: 7,
      spec: {
        outerwear: "torn black rain jacket",
        top: "gray thermal shirt",
        state_description: "wet hem and scraped sleeve after dungeon escape",
      },
    },
  ] as unknown as BibleSnapshotV2["costumes"];
  b.visual_motifs = [
    {
      name: "motif_exit_sign",
      meaning: "salvation that may also be a lure",
      draw_directive: "place a cracked EXIT pictogram reflection near Ren's shoulder",
      symbolic_lineage: "threshold / false safety",
      reference_scenes: ["dialogue loc_dungeon"],
    },
  ] as unknown as BibleSnapshotV2["visual_motifs"];
  return b;
}

function brokerScene(): PromptSceneForTest {
  return {
    beat_type: "setup",
    location_id: "loc_dungeon",
    mode: "dialogue",
    key_visual_intent: "Ren weighs an unsafe exit",
    time_axis: {
      label: "present",
      order: 1,
      is_flashback: false,
      is_flashforward: false,
      duration_hint: "minutes",
    },
    cast: [{ character_id: "char_ren", presence: "in_person" }],
    visual_motif_anchors: [{ motif_name: "motif_exit_sign", intensity: 1 }],
  };
}

function sectionBetween(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const contentStart = startIndex + start.length;
  const endIndex = text.indexOf(end, contentStart);
  expect(endIndex).toBeGreaterThan(contentStart);
  return text.slice(contentStart, endIndex);
}

describe("prompt-composer-v2 text validation", () => {
  it("extracts keywords from bible forbidden term entries", () => {
    expect(extractForbiddenKeywords("世界記録 (単独使用)")).toEqual(["世界記録"]);
    expect(extractForbiddenKeywords("冒険者 / ダイバー / ハンター")).toEqual([
      "冒険者",
      "ダイバー",
      "ハンター",
    ]);
  });

  it("detects forbidden terms before in-panel text render", () => {
    const result = validatePanelText(panel("世界記録なんて関係ない。"), bible());

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason:
        "forbidden term in dialogue: 世界記録 (単独使用 / records.synonyms_forbidden_in_isolation)",
      severity: "warn",
    }));
  });

  it("keeps backward compatibility when lexicon is absent", () => {
    const noLexicon = bible();
    noLexicon.world.lexicon = undefined;

    expect(validatePanelText(panel("世界記録なんて関係ない。"), noLexicon)).toEqual({ ok: true });
  });

  it("adds a render warning when forbidden text reaches L9", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const composed = composePanelPrompt({
      panel: panel("俺が世界記録を塗り替える。"),
      packet,
      bible: bible(),
      pageDimensions: { width: 600, height: 400 },
    });

    expect(composed.prompt).toContain("TEXT QUALITY WARNING");
    expect(composed.prompt).toContain("Storyboard L4 text should be regenerated");
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

const complianceBlocklist: Blocklist = {
  schema_version: 1,
  category_severity: {
    fatal: ["brands.convenience_store", "consumer_tech.devices"],
    warn: ["phrase_fragments"],
  },
  brands: {
    convenience_store: ["ローソン"],
  },
  consumer_tech: {
    devices: ["iPhone"],
  },
  phrase_fragments: ["ライ"],
};

const complianceFalsePositives: FalsePositives = {
  schema_version: 1,
  exact_term_excludes: [],
  context_excludes: [],
};

describe("prompt-composer-v2 Phase 0-5 compliance validation", () => {
  it("returns fatal findings for real company names in panel dialogue", () => {
    const result = validateAgainstCompliance(
      panel("ローソンで待ってる。"),
      bible(),
      complianceBlocklist,
      complianceFalsePositives,
    );

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      severity: "fatal",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings).toHaveLength(1);
      expect(result.findings?.[0]).toEqual(expect.objectContaining({
        matched_term: "ローソン",
        field_path: "panel.p1.dialogue[0]",
      }));
    }
  });

  it("skips katakana fragment matches inside longer narration words", () => {
    const target = panel("");
    target.dialogue = [];
    target.narration = ["物語はクライマックスへ向かう。"];

    expect(validateAgainstCompliance(
      target,
      bible(),
      complianceBlocklist,
      complianceFalsePositives,
    )).toEqual({ ok: true });
  });

  it("returns ok for clean panel text", () => {
    expect(validateAgainstCompliance(
      panel("ここで少し休もう。"),
      bible(),
      complianceBlocklist,
      complianceFalsePositives,
    )).toEqual({ ok: true });
  });

  it("returns fatal findings for brand terms in final render prompt", () => {
    const result = validatePromptAgainstCompliance(
      "主人公が最新の iPhone を取り出す。",
      complianceBlocklist,
      complianceFalsePositives,
    );

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      severity: "fatal",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings?.[0]).toEqual(expect.objectContaining({
        matched_term: "iPhone",
        field_path: "render_prompt",
      }));
    }
  });
});

describe("prompt-composer-v2 Phase 2-2 bible broker composition", () => {
  it("adds medium-tier character summaries through the bible broker", () => {
    const composed = composePanelPrompt({
      panel: panel("まだ決めるな。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      episodeNo: 5,
      bibleTier: "medium",
    });

    const characterBlock = sectionBetween(
      composed.prompt,
      "CHARACTERS IN PANEL:",
      "新宿第三1F",
    );
    expect(characterBlock).toContain("桐生 レン (char_ren, protagonist) ep.5 vol.1.");
    expect(characterBlock).toContain("心理/背景:");
    expect(characterBlock.length).toBeGreaterThanOrEqual(400);
    expect(characterBlock.length).toBeLessThan(1000);
  });

  it("injects the scene override body instead of only listing override keys", () => {
    const composed = composePanelPrompt({
      panel: panel("ここで話す。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
    });

    expect(composed.prompt).toContain(
      "Use restrained dialogue pacing with clean bubble staging and quiet close-up acting.",
    );
    expect(composed.prompt).not.toContain("Scene tone overrides available");
  });

  it("adds anchored motif draw directives for the scene", () => {
    const composed = composePanelPrompt({
      panel: panel("出口が見える。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
    });

    expect(composed.prompt).toContain("RECURRING VISUAL MOTIFS (must include):");
    expect(composed.prompt).toContain("place a cracked EXIT pictogram reflection near Ren's shoulder");
  });

  it("adds active costume specs that override outfit_default", () => {
    const composed = composePanelPrompt({
      panel: panel("濡れてるな。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      episodeNo: 5,
    });

    expect(composed.prompt).toContain("ACTIVE COSTUMES (override outfit_default):");
    expect(composed.prompt).toContain("char_ren wears torn black rain jacket gray thermal shirt");
    expect(composed.prompt).toContain("wet hem and scraped sleeve after dungeon escape");
  });

  it("adds matching world rules as WORLD CONSTRAINTS", () => {
    const composed = composePanelPrompt({
      panel: panel("案内板が変だ。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
    });

    expect(composed.prompt).toContain("WORLD CONSTRAINTS:");
    expect(composed.prompt).toContain("loc_dungeonでは壁面の古い案内板");
  });
});
