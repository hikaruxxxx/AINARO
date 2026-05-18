import { describe, expect, it, vi } from "vitest";
import type {
  BibleSnapshotV2,
  PagePlanPage,
  PanelV2,
  ResolvedRefPacket,
  StoryboardPageV2,
} from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";
import type {
  Blocklist,
  FalsePositives,
} from "../compliance/types";
import {
  composePagePrompt,
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

function page(panelCount = 6): StoryboardPageV2 {
  return {
    page_no: 1,
    page_role: "dialogue",
    panels: Array.from({ length: panelCount }, (_, index) => ({
      ...panel(`台詞${index + 1}`),
      panel_id: `p${index + 1}`,
      panel_no: index + 1,
      reading_order: index + 1,
      action: `レンが出口と案内板を確認する ${index + 1}`,
      key_visual: `濡れた床の反射とレンの警戒した表情 ${index + 1}`,
    })),
  };
}

const packet: ResolvedRefPacket = {
  panel_id: "p1",
  refs: [],
  warnings: [],
} as unknown as ResolvedRefPacket;

type PromptSceneForTest = Pick<
  Scene,
  | "beat_type"
  | "location_id"
  | "mode"
  | "key_visual_intent"
  | "time_axis"
  | "cast"
  | "wardrobe_state"
  | "world_rules_active"
  | "props_in_play"
> & {
  visual_motif_anchors?: Array<{ motif_name?: string; intensity?: number }>;
  theme_subtext?: Scene["theme_subtext"] | string;
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
  b.props = [
    {
      id: "prop_cracked_phone",
      name: "cracked phone",
      spec: {
        visual_description: "A smartphone with a spiderweb crack over the front camera and a dead notification icon.",
      },
      continuity_anchors: ["spiderweb crack", "dead notification icon"],
    },
  ] as unknown as BibleSnapshotV2["props"];
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

function deepBrokerBible(): BibleSnapshotV2 {
  const b = brokerBible();
  const longText = (seed: string, repeat: number) =>
    Array.from({ length: repeat }, (_, index) => `${seed}${index + 1}。`).join("");
  b.world.premise = longText("新宿地下の異常空間は登録制度と駅構造の記憶を混ぜ、通行者の判断を試す", 60);
  b.world.rules = [
    longText("loc_dungeonでは壁面案内板が安全経路と危険経路を同じ記号で示す", 20),
    longText("dialogue時でも床面反射は直前の選択を薄く映し、読者に違和感を残す", 20),
    longText("setupでは登録証の表示が本人の迷いで欠け、能力表示は断片化する", 20),
  ];
  b.world.power_system_logic = longText("能力表示は視認した事実だけを記録し、推測や願望を数値化しない", 45);
  b.world.social_strata = longText("登録等級は仕事の単価だけでなく避難時の優先順位にも影響する", 45);
  b.characters = b.characters.map((character) => ({
    ...character,
    appearance_notes: longText("左前髪、疲れた目、濡れたフード、片肩の上がり方を必ず維持する", 55),
    psychology_deep: longText("約束を罠として読む一方で、他人の恐怖を見落とせず実務で助けようとする", 55),
    backstory: longText("過去の救助失敗が英雄的な言葉への不信と、遅れへの過敏さを残している", 45),
    defense_mechanisms: longText("追い込まれると冗談で距離を取り、出口と相手の手元を先に確認する", 45),
    worldview_filter: longText("部屋を危険地図として読み、光源、反射、扉、遮蔽物の順に意味付ける", 45),
  })) as BibleSnapshotV2["characters"];
  b.locations = b.locations.map((location) => ({
    ...location,
    spec: {
      ...location.spec,
      visual_description: longText("地下駅に似た通路、欠けたタイル、濡れた床、古い案内板、蛍光灯の明滅", 45),
      sensory_textures: longText("水滴音、電気の唸り、冷気、靴音の反響が台詞の間を埋める", 35),
    },
  })) as BibleSnapshotV2["locations"];
  b.visual_motifs = [
    {
      name: "motif_exit_sign",
      meaning: longText("救済に見える出口が誘導でもある", 30),
      draw_directive: longText("レンの肩近くに割れたEXITピクトの反射を置き、床面で歪ませる", 30),
      symbolic_lineage: longText("境界、偽の安全、登録制度", 20),
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
    wardrobe_state: [{ character_id: "char_ren", costume_id: "costume_ren_ep5" }],
    world_rules_active: ["Only information visible in the panel can become a valid ability display."],
    props_in_play: [{ prop_id: "prop_cracked_phone", held_by: "char_ren" }],
    theme_subtext: { theme_id: "theme_false_safety", how_it_surfaces: "The exit feels like rescue and bait at the same time." },
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

function withUseBibleV3<T>(value: "true" | "false" | undefined, fn: () => T): T {
  const original = process.env.USE_BIBLE_V3;
  if (value === undefined) {
    delete process.env.USE_BIBLE_V3;
  } else {
    process.env.USE_BIBLE_V3 = value;
  }
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.USE_BIBLE_V3;
    } else {
      process.env.USE_BIBLE_V3 = original;
    }
  }
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

  it("adds D-axis scene context blocks to panel prompts", () => {
    const composed = composePanelPrompt({
      panel: panel("画面を見ろ。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
      episodeNo: 5,
    });

    expect(composed.prompt).toContain("SCENE WARDROBE STATE (must match):");
    expect(composed.prompt).toContain("桐生 レン (char_ren): torn black rain jacket gray thermal shirt");
    expect(composed.prompt).toContain("ACTIVE WORLD RULES IN THIS SCENE");
    expect(composed.prompt).toContain("Only information visible in the panel");
    expect(composed.prompt).toContain("PROPS IN PLAY (include if visually relevant):");
    expect(composed.prompt).toContain("cracked phone (held by 桐生 レン)");
    expect(composed.prompt).toContain("SCENE EMOTIONAL THEME");
    expect(composed.prompt).toContain("rescue and bait");
  });

  it("adds D-axis scene context blocks to page prompts", () => {
    const composed = composePagePrompt({
      page: page(2),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
    });

    // 2026-05-13 SCENE 圧縮後: 旧長いヘッダー (SCENE WARDROBE STATE / ACTIVE WORLD RULES /
    // PROPS IN PLAY / SCENE EMOTIONAL THEME) は短縮形 (Active rules / Props / Theme) に変更。
    // SCENE WARDROBE は CONTINUITY (Active costumes) と重複するので SCENE からは削除。
    expect(composed.prompt).toContain("Active rules this scene");
    expect(composed.prompt).toContain("Props:");
    expect(composed.prompt).toContain("Theme:");
    expect(composed.prompt.length).toBeLessThanOrEqual(8000);
  });

  it("composePagePrompt defaults to minimal tier and stays within the prompt threshold for deep bible input", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const composed = withUseBibleV3("false", () => composePagePrompt({
      page: page(),
      packet,
      bible: deepBrokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      episodeNo: 5,
      scene: brokerScene(),
    }));

    expect(composed.tierUsed).toBe("minimal");
    expect(composed.prompt.length).toBeLessThanOrEqual(8000);
    expect(composed.prompt).toContain("桐生 レン");
    expect(composed.prompt).toContain("新宿第三1F");
    expect(composed.prompt).toContain("motif_exit_sign");
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("downgrading"));
    warnSpy.mockRestore();
  });

  it("composePagePrompt keeps prompt under MAX_PROMPT_CHARS even with deep bible", () => {
    // 2026-05-13: 大幅圧縮後は deep tier でも 8000 字内に収まることが多くなり
    // 旧来の "deep → minimal downgrade" を強制発火させるのは fixture 規模では困難。
    // ここでは「deep bible を渡しても tier フォールバック機構が壊れず prompt が
    // MAX_PROMPT_CHARS=8000 以下に着地する」ことだけを検証する。
    const composed = withUseBibleV3("false", () => composePagePrompt({
      page: page(),
      packet,
      bible: deepBrokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      episodeNo: 5,
      scene: brokerScene(),
      bibleTier: "deep",
    }));

    expect(composed.prompt.length).toBeLessThanOrEqual(8000);
    // tier は overflow しなければ deep のまま残る (downgrade されない場合あり)
    expect(["deep", "minimal"]).toContain(composed.tierUsed);
  });

  it("minimal character context in composed prompt remains compact", () => {
    const composed = composePanelPrompt({
      panel: panel("出口を見る。"),
      packet,
      bible: deepBrokerBible(),
      pageDimensions: { width: 600, height: 400 },
      episodeNo: 5,
      scene: brokerScene(),
      bibleTier: "minimal",
    });

    const characterBlock = sectionBetween(
      composed.prompt,
      "CHARACTERS IN PANEL:",
      "新宿第三1F",
    );
    expect(characterBlock.length).toBeGreaterThanOrEqual(150);
    expect(characterBlock.length).toBeLessThanOrEqual(330);
    expect(characterBlock).toContain("外見:");
    expect(characterBlock).toContain("心理:");
  });
});

describe("prompt-composer-v2 USE_BIBLE_V3 parity", () => {
  it("uses the V3 broker path by default when USE_BIBLE_V3 is unset", () => {
    const args = {
      panel: panel("出口が見える。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "medium" as const,
    };

    const defaultPath = withUseBibleV3(undefined, () => composePanelPrompt(args));
    const explicitV3 = withUseBibleV3("true", () => composePanelPrompt(args));

    expect(defaultPath.prompt).toBe(explicitV3.prompt);
    expect(defaultPath.refImagePaths).toEqual(explicitV3.refImagePaths);
    expect(defaultPath.tierUsed).toBe(explicitV3.tierUsed);
  });

  it("composePanelPrompt returns semantically equivalent output for legacy and V3 broker paths", () => {
    const args = {
      panel: panel("出口が見える。"),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 600, height: 400 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "medium" as const,
    };

    const legacy = withUseBibleV3("false", () => composePanelPrompt(args));
    const v3 = withUseBibleV3("true", () => composePanelPrompt(args));

    expect(v3.prompt).toContain("桐生 レン");
    expect(v3.prompt).toContain("char_ren");
    expect(v3.prompt).toContain("外見");
    expect(v3.prompt).toContain("心理");
    expect(v3.prompt.length).toBeGreaterThan(legacy.prompt.length * 0.5);
    expect(v3.prompt.length).toBeLessThan(legacy.prompt.length * 2.0);
    expect(v3.refImagePaths).toEqual(legacy.refImagePaths);
    expect(v3.tierUsed).toBe(legacy.tierUsed);
  });

  it("composePagePrompt returns semantically equivalent output for legacy and V3 broker paths", () => {
    const args = {
      page: page(2),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };

    const legacy = withUseBibleV3("false", () => composePagePrompt(args));
    const v3 = withUseBibleV3("true", () => composePagePrompt(args));

    expect(v3.prompt).toContain("桐生 レン");
    expect(v3.prompt).toContain("char_ren");
    // 2026-05-13 page-level CONTINUITY 統合後: panel#N CONTINUITY は出ず
    // "Characters (face/outfit invariants across this page)" 形式に
    expect(v3.prompt).toContain("Characters (face/outfit invariants");
    // 2026-05-13: WORLD CONSTRAINTS ヘッダーは "World rules:" に短縮
    expect(v3.prompt).toContain("World rules:");
    expect(v3.prompt.length).toBeGreaterThan(legacy.prompt.length * 0.5);
    expect(v3.prompt.length).toBeLessThan(legacy.prompt.length * 2.0);
    expect(v3.refImagePaths).toEqual(legacy.refImagePaths);
    expect(v3.tierUsed).toBe(legacy.tierUsed);
  });

  it("composePagePrompt outputs new markdown section structure with unified panel#N numbering", () => {
    const args = {
      page: page(3),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toMatch(/^# PAGE\n/);
    expect(result.prompt).toContain("## STYLE");
    expect(result.prompt).toContain("## REFERENCES");
    expect(result.prompt).toContain("## LAYOUT");
    expect(result.prompt).toContain("## CONTINUITY");
    expect(result.prompt).toContain("## PANELS");
    expect(result.prompt).toContain("## CONSTRAINTS");
    for (let n = 1; n <= 3; n += 1) {
      expect(result.prompt).toContain(`### panel#${n}`);
    }
    // 2026-05-13: CONTINUITY は page-level 統合に切り替わり panel#N CONTINUITY は出ない
    expect(result.prompt).toContain("Characters (face/outfit invariants");
    const layoutChunk = result.prompt.split("## LAYOUT")[1]?.split("##")[0] ?? "";
    expect(layoutChunk).not.toContain("bg_treatment=");
    expect(result.prompt.length).toBeLessThanOrEqual(8000);
  });

  it("composePagePrompt embed mode (default) keeps Japanese dialogue text and lettering directive", () => {
    const args = {
      page: page(2),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("「台詞1」");
    expect(result.prompt).not.toContain("Speech bubble shells");
    expect(result.prompt).not.toContain("EMPTY speech bubble shells");
  });

  it("composePagePrompt shells_only mode strips dialogue text and adds shell directive", () => {
    const args = {
      page: page(2),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
      typesetMode: "shells_only" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("「台詞1」");
    expect(result.prompt).not.toContain("「台詞2」");
    expect(result.prompt).toContain("Speech bubble shells");
    expect(result.prompt).toContain("Draw EMPTY speech bubble shells");
  });

  it("composePagePrompt formatRefLabel omits weight when weight≈1.0", () => {
    const args = {
      page: page(1),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("weight 1.00");
  });

  it("composePagePrompt prefers style_directives.digest when present (falls back to global otherwise)", () => {
    const bibleWithDigest = brokerBible();
    // brokerBible() の style_directives.global を一旦保存して、digest を別文字列で注入
    const originalGlobal = bibleWithDigest.style_directives.global;
    bibleWithDigest.style_directives = {
      ...bibleWithDigest.style_directives,
      global: originalGlobal,
      digest: "DIGEST_SENTINEL_STYLE: compact 100 char rule.",
    };
    const args = {
      page: page(1),
      packet,
      bible: bibleWithDigest,
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("DIGEST_SENTINEL_STYLE");
    expect(result.prompt).not.toContain(originalGlobal);

    // digest を消すと global にフォールバック
    const bibleNoDigest = brokerBible();
    const argsNoDigest = { ...args, bible: bibleNoDigest };
    const fallback = composePagePrompt(argsNoDigest);
    expect(fallback.prompt).toContain(bibleNoDigest.style_directives.global);
    expect(fallback.prompt).not.toContain("DIGEST_SENTINEL_STYLE");
  });

  it("composePagePrompt extracts page-shared Characters/Location when all panels share them", () => {
    // fixture の page(N) は全 panel が char_ren + loc_dungeon を共有 → shared 認定されるはず
    const args = {
      page: page(3),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    // page-shared header が出ている
    expect(result.prompt).toContain("All panels on this page share these characters and location");
    expect(result.prompt).toContain("Shared characters:");
    expect(result.prompt).toContain("Shared location:");
    // panel block に Characters / Location 行は出ない (Expressions に置き換わる)
    const panelsChunk = result.prompt.split("## PANELS")[1] ?? "";
    expect(panelsChunk).toContain("Expressions:");
    expect(panelsChunk).not.toMatch(/^- Characters: /m);
    expect(panelsChunk).not.toMatch(/^- Location: /m);
  });

  it("composePagePrompt keeps per-panel Characters/Location when any panel differs", () => {
    // panel#2 だけ Location を別にする → shared 不成立
    const p = page(3);
    p.panels[1].entities = {
      ...p.panels[1].entities,
      location_id: "loc_different_location",
    };
    const args = {
      page: p,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("All panels on this page share these characters and location");
    // panel block で従来通り Characters/Location が並ぶ
    const panelsChunk = result.prompt.split("## PANELS")[1] ?? "";
    expect(panelsChunk).toMatch(/- Characters: /);
    expect(panelsChunk).toMatch(/- Location: /);
  });
});

describe("prompt-composer-v2 PANEL SIZE OVERRIDE (Sprint 7 追加チューニング)", () => {
  // PAGE_W=1748, PAGE_H=2480 (prompt-composer-v2 内定数と一致させる)
  // ratios を縦方向の h 比で割り付けた page_plan を返す
  function pagePlanFromRatios(
    storyPage: StoryboardPageV2,
    ratios: number[],
  ): PagePlanPage {
    const PAGE_W = 1748;
    const PAGE_H = 2480;
    let y = 0;
    const panels = storyPage.panels.map((p, i) => {
      const ratio = ratios[i] ?? 1 / storyPage.panels.length;
      const h = PAGE_H * ratio;
      const rect = { x: 0, y, w: PAGE_W, h };
      y += h;
      return {
        panel_id: p.panel_id,
        slot_id: `s${i + 1}`,
        rect,
        reading_order: p.reading_order,
        importance: (i === 0 ? 5 : 3) as 1 | 2 | 3 | 4 | 5,
      };
    });
    return {
      page_no: storyPage.page_no,
      layout_template_id: "v4_test_variance",
      page_role: storyPage.page_role,
      render_strategy: "page_one_shot",
      panels,
    };
  }

  it("emits PANEL SIZE OVERRIDE with per-panel area% and FORBIDDEN warning when pagePlanPage is present", () => {
    // 5 panel page、L05 enforceVarianceRule の targetRatios と同形 [0.4, 0.1, 0.1, 0.2, 0.2]
    const storyPage = page(5);
    const plan = pagePlanFromRatios(storyPage, [0.4, 0.1, 0.1, 0.2, 0.2]);
    const args = {
      page: storyPage,
      pagePlanPage: plan,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("## PANEL SIZE OVERRIDE");
    expect(result.prompt).toContain("PANEL SIZE OVERRIDE (STRICT");
    expect(result.prompt).toContain("panel#1 MUST occupy 40% of page area (DOMINANT");
    expect(result.prompt).toContain("panel#2 MUST occupy 10% of page area (SMALL_INSET");
    expect(result.prompt).toContain("panel#4 MUST occupy 20% of page area (MID");
    // ratio = 40 / 10 = 4.0x
    expect(result.prompt).toContain("Largest panel is 4.0x the area of smallest");
    expect(result.prompt).toContain("FORBIDDEN");
  });

  it("omits PANEL SIZE OVERRIDE when pagePlanPage is not provided", () => {
    const args = {
      page: page(3),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("## PANEL SIZE OVERRIDE");
    expect(result.prompt).not.toContain("PANEL SIZE OVERRIDE (STRICT");
  });

  it("emits ROW LAYOUT with SIDE-BY-SIDE annotation for 3-panel page with horizontal bottom row (Sprint 8 案1)", () => {
    // p01 を模倣: panel#1 = 上端全幅 (50%)、panel#2 = 右下 (12%)、panel#3 = 左下 (12%)
    const storyPage = page(3);
    const PAGE_W = 1748;
    const PAGE_H = 2480;
    const plan: PagePlanPage = {
      page_no: storyPage.page_no,
      layout_template_id: "v4_test_horizontal_row",
      page_role: storyPage.page_role,
      render_strategy: "page_one_shot",
      panels: [
        {
          panel_id: storyPage.panels[0].panel_id,
          slot_id: "s1",
          rect: { x: 0, y: 0, w: PAGE_W, h: Math.floor(PAGE_H * 0.5) },
          reading_order: 1,
          importance: 5,
        },
        {
          panel_id: storyPage.panels[1].panel_id,
          slot_id: "s2",
          rect: { x: PAGE_W / 2, y: Math.floor(PAGE_H * 0.5), w: PAGE_W / 2, h: Math.floor(PAGE_H * 0.25) },
          reading_order: 2,
          importance: 4,
        },
        {
          panel_id: storyPage.panels[2].panel_id,
          slot_id: "s3",
          rect: { x: 0, y: Math.floor(PAGE_H * 0.5), w: PAGE_W / 2, h: Math.floor(PAGE_H * 0.25) },
          reading_order: 3,
          importance: 3,
        },
      ],
    };
    const args = {
      page: storyPage,
      pagePlanPage: plan,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: PAGE_W, height: PAGE_H },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("## ROW LAYOUT");
    // 2026-05-18 Sprint 22 案6 で 1 行 compact 化
    expect(result.prompt).toContain("ROW LAYOUT (2 rows):");
    expect(result.prompt).toContain("ROW1 (TOP,h=50%): panel#1 full 100%w×50%h");
    expect(result.prompt).toContain("ROW2 (BOTTOM,h=25%) 2-up SIDE-BY-SIDE:");
    expect(result.prompt).toContain("panel#2 R 50%w×25%h");
    expect(result.prompt).toContain("panel#3 L 50%w×25%h");
    expect(result.prompt).toContain("(RTL: R first)");
    expect(result.prompt).toContain("WARN: side-by-side rows 2 must NOT stack vertically");
    expect(result.prompt).toContain("do not expand a small panel to fill the row");
  });

  it("omits ROW LAYOUT when all panels stack vertically (1 panel per row)", () => {
    // 縦積み 3 panel page: 全 panel が全幅、y が連続
    const storyPage = page(3);
    const PAGE_W = 1748;
    const PAGE_H = 2480;
    const rowH = Math.floor(PAGE_H / 3);
    const plan: PagePlanPage = {
      page_no: storyPage.page_no,
      layout_template_id: "v4_test_vertical_stack",
      page_role: storyPage.page_role,
      render_strategy: "page_one_shot",
      panels: storyPage.panels.map((p, i) => ({
        panel_id: p.panel_id,
        slot_id: `s${i + 1}`,
        rect: { x: 0, y: rowH * i, w: PAGE_W, h: rowH },
        reading_order: p.reading_order,
        importance: 3 as const,
      })),
    };
    const args = {
      page: storyPage,
      pagePlanPage: plan,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: PAGE_W, height: PAGE_H },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("## ROW LAYOUT");
    expect(result.prompt).not.toContain("SIDE-BY-SIDE");
    expect(result.prompt).not.toContain("HORIZONTAL ROW WARNING");
  });

  it("emits BIBLE FACTS section with timeline/system excerpts and number-invention guard (Sprint 9 案B + Sprint 21 案6 圧縮)", () => {
    const bibleWithFacts = brokerBible();
    // Sprint 21 案6: MAX=150 に圧縮、150字以内のテキストはそのまま含まれる
    bibleWithFacts.world.timeline =
      "20年前、世界中の都市の地下に巨大な接続口が同時に開いた。封鎖・軍事投入が連続して失敗した。";
    bibleWithFacts.world.system =
      "全人類は18歳までに鑑定石でS/A/B/C/D/E/Fの七段階の適性ランクを判定される。判定値は公社アプリに同期される。";
    const args = {
      page: page(3),
      packet,
      bible: bibleWithFacts,
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("## BIBLE FACTS");
    expect(result.prompt).toContain("Quantitative facts excerpted from bible");
    expect(result.prompt).toContain("20年前");
    expect(result.prompt).toContain("18歳まで");
    expect(result.prompt).toContain("Do NOT invent alternative numbers");
    expect(result.prompt).toContain("do not paraphrase or rewrite narration");
  });

  it("omits BIBLE FACTS section when bible.world.timeline and system are both empty", () => {
    const bibleNoFacts = brokerBible();
    bibleNoFacts.world.timeline = "";
    bibleNoFacts.world.system = "";
    const args = {
      page: page(3),
      packet,
      bible: bibleNoFacts,
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("## BIBLE FACTS");
    expect(result.prompt).not.toContain("Quantitative facts excerpted from bible");
  });

  it("emits SCENE PANEL RESTRICTIONS section when page contains an establishing panel (Sprint 11 案1 → Sprint 12 拡張)", () => {
    const storyPage = page(3);
    storyPage.panels[0].shot_type = "establishing";
    const args = {
      page: storyPage,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("## SCENE PANEL RESTRICTIONS");
    // 2026-05-18 Sprint 22 案6 で 1 行 compact 化
    expect(result.prompt).toContain("SCENE PANEL RESTRICTIONS (panel#1 — establishing/wide, MANDATORY)");
    expect(result.prompt).toContain("ZERO for atmospheric establishing/wide");
    expect(result.prompt).toContain("MUST NOT: SNS feeds, LIVE tickers");
    expect(result.prompt).toContain("Less is more");
  });

  it("Sprint 12 拡張: wide shot_type も SCENE PANEL RESTRICTIONS の対象に含まれる", () => {
    const storyPage = page(3);
    // panel#2 を wide に、panel#1 を medium のまま
    storyPage.panels[1].shot_type = "wide";
    const args = {
      page: storyPage,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).toContain("## SCENE PANEL RESTRICTIONS");
    expect(result.prompt).toContain("panel#2");
    expect(result.prompt).toContain("establishing/wide");
  });

  it("omits SCENE PANEL RESTRICTIONS when no panel is establishing or wide", () => {
    const storyPage = page(3);
    // 全 panel が medium (デフォルト)
    const args = {
      page: storyPage,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("## SCENE PANEL RESTRICTIONS");
    expect(result.prompt).not.toContain("SCENE PANEL RESTRICTIONS");
  });

  it("Sprint 22 案B 撤回 (2026-05-18): panel.effect_lines per-panel directive は出力しない (削減系優位、AI 委任)", () => {
    const storyPage = page(3);
    (storyPage.panels[0] as unknown as { effect_lines: unknown }).effect_lines = {
      type: "radial",
      intensity: "strong",
      centerX: 0.65,
      centerY: 0.4,
    };
    const args = {
      page: storyPage,
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    // p24 v18 で複数中心拡散の原因と判明したため、prompt directive は撤回済
    expect(result.prompt).not.toContain("Effect lines: type=");
    expect(result.prompt).not.toContain("center at (");
  });

  it("MANGA_CRAFT_DIRECTIVES_V6 no longer contains the legacy generic 'Panel size variation' directive", () => {
    // page-specific な PANEL SIZE OVERRIDE に役割が移ったため、汎用節は削除済
    const args = {
      page: page(3),
      packet,
      bible: brokerBible(),
      pageDimensions: { width: 1748, height: 2480 },
      scene: brokerScene(),
      episodeNo: 5,
      bibleTier: "minimal" as const,
    };
    const result = composePagePrompt(args);
    expect(result.prompt).not.toContain("Panel size variation (CRITICAL)");
    expect(result.prompt).not.toContain("smallest <= 12%, largest >= 35%");
  });
});
