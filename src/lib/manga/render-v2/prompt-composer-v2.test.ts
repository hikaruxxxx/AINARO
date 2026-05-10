import { describe, expect, it, vi } from "vitest";
import type {
  BibleSnapshotV2,
  PanelV2,
  ResolvedRefPacket,
} from "../schemas-v2";
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
