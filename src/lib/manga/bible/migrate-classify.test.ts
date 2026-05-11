import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BibleSnapshotV2 } from "../schemas-v2";
import * as codexText from "../llm/codex-text";
import {
  findRoleEnumViolations,
  runMigration,
  runMigrationWithLlmRefine,
  runMigrationWithSubSplit,
  subSplitFieldIntoLayers,
} from "./migrate-classify";
import { deriveFactId } from "./v3-adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("migrate-classify", () => {
  it("V2 → V3 で characters/locations の facts が生成される", () => {
    const v2 = createMinimalV2();
    const result = runMigration(v2);
    expect(result.v3.schema_version).toBe(3);
    expect(result.v3.facts.length).toBeGreaterThan(0);
    expect(
      result.v3.facts.some((fact) => fact.entity_id === "char_ren")
    ).toBe(true);
    expect(
      result.v3.facts.some((fact) => fact.entity_id === "loc_store")
    ).toBe(true);
  });

  it("findRoleEnumViolations は heroine を検出して supporting + subrole=heroine 推奨を返す", () => {
    const v2 = createMinimalV2();
    (v2.characters[0] as { role: string }).role = "heroine";
    const violations = findRoleEnumViolations(v2);
    expect(violations.length).toBe(1);
    expect(violations[0].recommended_role).toBe("supporting");
    expect(violations[0].recommended_subrole).toBe("heroine");
  });

  it("確信度 < 0.7 の fact は needsReview に入る (現状は無いはず)", () => {
    const v2 = createMinimalV2();
    const result = runMigration(v2);
    expect(Array.isArray(result.needsReview)).toBe(true);
    expect(result.needsReview.length).toBe(0);
  });

  it("factSourcePathIndex は全 fact をカバーする", () => {
    const v2 = createMinimalV2();
    const result = runMigration(v2);
    expect(Object.keys(result.factSourcePathIndex).length).toBe(
      result.v3.facts.length
    );
  });

  it.skipIf(!process.env.RUN_REAL_BIBLE_TEST)(
    "a07 で migration が動き role=heroine 違反を検出する",
    async () => {
      const fs = await import("node:fs/promises");
      const v2 = JSON.parse(
        await fs.readFile(
          "/Users/hikarumori/Developer/AINARO/data/manga/works/a07-modern-dungeon/bible/snapshot.json",
          "utf-8"
        )
      ) as BibleSnapshotV2;
      const result = runMigration(v2);
      expect(result.v3.facts.length).toBeGreaterThan(50);
      expect(result.roleEnumViolations.length).toBe(2);
    }
  );

  it("LLM refine で aggregated_confidence を計算する", async () => {
    vi.spyOn(codexText, "runCodexText").mockResolvedValue({
      stdout:
        '{"suggested_layer":"in_world_belief","suggested_aspect":"psychology","confidence":0.85,"rationale":"妥当"}',
      parsed: {
        suggested_layer: "in_world_belief",
        suggested_aspect: "psychology",
        confidence: 0.85,
        rationale: "妥当",
      },
      attempts: 1,
      totalDurationMs: 100,
    });
    const v2 = createMinimalV2();
    const result = await runMigrationWithLlmRefine(v2, {
      rounds: 1,
      maxParallel: 1,
    });
    expect(result.llm_refine.fact_results.length).toBeGreaterThan(0);
    expect(result.llm_refine.summary.avg_confidence).toBeCloseTo(0.85, 2);
    expect(result.needsReview.length).toBe(0);
  });

  it("layer がばらついた fact は unstable 扱い", async () => {
    const v2 = createMinimalV2();
    const factsPerRound = runMigration(v2).v3.facts.length;
    let callCount = 0;
    vi.spyOn(codexText, "runCodexText").mockImplementation(async () => {
      const isFirstRound = callCount++ < factsPerRound;
      return {
        stdout: "{}",
        parsed: isFirstRound
          ? {
              suggested_layer: "in_world_belief",
              suggested_aspect: "psychology",
              confidence: 0.8,
              rationale: "",
            }
          : {
              suggested_layer: "meta_truth",
              suggested_aspect: "psychology",
              confidence: 0.6,
              rationale: "",
            },
        attempts: 1,
        totalDurationMs: 100,
      };
    });
    const result = await runMigrationWithLlmRefine(v2, {
      rounds: 2,
      maxParallel: 1,
    });
    const unstable = result.llm_refine.fact_results.filter((f) => !f.stable);
    expect(unstable.length).toBeGreaterThan(0);
    expect(result.llm_refine.summary.unstable_facts).toBe(unstable.length);
  });

  it("existingProgress の完了済み round は Codex 呼び出しを skip する", async () => {
    const v2 = createMinimalV2();
    const deterministic = runMigration(v2);
    const existingProgress = deterministic.v3.facts.map((fact) => ({
      fact_id: fact.fact_id,
      round: 1,
      result: {
        round: 1,
        suggested_layer: fact.layer,
        suggested_aspect: fact.aspect,
        confidence: 0.9,
        rationale: "resume",
      },
      ts: "2026-05-11T00:00:00.000Z",
    }));
    const spy = vi.spyOn(codexText, "runCodexText").mockResolvedValue({
      stdout: "{}",
      parsed: {
        suggested_layer: "in_world_belief",
        suggested_aspect: "psychology",
        confidence: 0.1,
        rationale: "",
      },
      attempts: 1,
      totalDurationMs: 100,
    });

    const result = await runMigrationWithLlmRefine(v2, {
      rounds: 1,
      maxParallel: 1,
      existingProgress,
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.llm_refine.summary.avg_confidence).toBeCloseTo(0.9, 2);
  });

  it("subSplitFieldIntoLayers が複数 sub-fact を返す", async () => {
    vi.spyOn(codexText, "runCodexText").mockResolvedValue({
      stdout: "{}",
      parsed: {
        sub_facts: [
          {
            layer: "in_world_belief",
            aspect: "backstory",
            body: "出生地 X",
            revealed_at_volume: null,
            arc_at_volume: null,
            rationale: "",
          },
          {
            layer: "revealed_at_volume",
            aspect: "backstory",
            body: "母の真実",
            revealed_at_volume: 7,
            arc_at_volume: null,
            rationale: "",
          },
        ],
      },
      attempts: 1,
      totalDurationMs: 100,
    });

    const result = await subSplitFieldIntoLayers({
      v2: createMinimalV2(),
      entity_id: "char_a",
      source_path: "characters[0].backstory",
      body: "出生地 X。母の真実。",
      default_aspect: "backstory",
    });

    expect(result.facts.length).toBe(2);
    expect(result.facts[0].layer).toBe("in_world_belief");
    expect(result.facts[1].revealed_at_volume).toBe(7);
    expect(result.facts[0].evidence.generated_by?.stage).toBe("v9-sub-split");
  });

  it("runMigrationWithSubSplit が fact 数を expand する", async () => {
    vi.spyOn(codexText, "runCodexText").mockResolvedValue({
      stdout: "{}",
      parsed: {
        sub_facts: [
          {
            layer: "in_world_belief",
            aspect: "backstory",
            body: "公開情報",
            revealed_at_volume: null,
            arc_at_volume: null,
            rationale: "",
          },
          {
            layer: "meta_truth",
            aspect: "backstory",
            body: "裏の真実",
            revealed_at_volume: null,
            arc_at_volume: null,
            rationale: "",
          },
        ],
      },
      attempts: 1,
      totalDurationMs: 100,
    });
    const v2 = createMinimalV2();
    const original = runMigration(v2).v3.facts.length;
    const result = await runMigrationWithSubSplit(v2, { maxParallel: 1 });

    expect(result.sub_split.fields_processed).toBeGreaterThan(0);
    expect(result.sub_split.failed_fields).toBe(0);
    expect(result.sub_split.sub_facts_total).toBe(
      result.sub_split.fields_processed * 2
    );
    expect(result.v3.facts.length).toBeGreaterThan(original);
    expect(result.sub_split.summary.after_sub_split).toBe(result.v3.facts.length);
  });

  it("deriveFactId が segment_index で衝突回避", () => {
    const id1 = deriveFactId({
      entity_id: "char_a",
      aspect: "backstory",
      layer: "in_world_belief",
      source_path: "x",
      segment_index: 0,
    });
    const id2 = deriveFactId({
      entity_id: "char_a",
      aspect: "backstory",
      layer: "in_world_belief",
      source_path: "x",
      segment_index: 1,
    });

    expect(id1).not.toBe(id2);
  });

  it("swap script dry-run で v3 stats を出力し atomic write を呼ばない", async () => {
    const previousRoot = process.env.AINARO_REPO_ROOT;
    const tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-swap-"));
    process.env.AINARO_REPO_ROOT = tmpRepo;
    vi.resetModules();

    try {
      const slug = "swap-test";
      const biblePath = path.join(tmpRepo, "data", "manga", "works", slug, "bible");
      await fs.mkdir(biblePath, { recursive: true });

      const v2 = createMinimalV2();
      v2.meta.slug = slug;
      const migration = runMigration(v2);
      await fs.writeFile(path.join(biblePath, "snapshot.json"), `${JSON.stringify(v2, null, 2)}\n`, "utf-8");
      await fs.writeFile(
        path.join(biblePath, "v3-classified-llm-refine.json"),
        `${JSON.stringify({ ...migration, v3: { ...migration.v3, meta: { ...migration.v3.meta, slug } } }, null, 2)}\n`,
        "utf-8",
      );

      const atomicWrite = await import("./atomic-write");
      const writeSpy = vi.spyOn(atomicWrite, "writeSnapshotV3Atomic");
      const { runSwap } = await import("../../../../scripts/manga/migrate/swap-v2-to-v3");
      let stdout = "";
      const code = await runSwap({
        argv: ["--slug", slug, "--dry-run", "--allow-fatal"],
        stdout: { write: (chunk: string | Uint8Array) => { stdout += String(chunk); return true; } },
      });

      expect(code).toBe(0);
      expect(stdout).toContain("[swap] dry-run mode");
      expect(stdout).toContain("would write to:");
      expect(stdout).toContain("v3 stats:");
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      if (previousRoot === undefined) {
        delete process.env.AINARO_REPO_ROOT;
      } else {
        process.env.AINARO_REPO_ROOT = previousRoot;
      }
    }
  });
});

function createMinimalV2(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: {
      source_type: "v2_concept_json",
      source_path: "fixture/minimal.json",
    },
    meta: {
      slug: "minimal",
      title: "Minimal",
      art_style: "manga_monochrome" as never,
      genre: "modern_dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
    },
    world: {
      premise: "Fランク探索者が制度の隙間から成長する。",
      rules: [
        "ランクは公社が管理する。",
        "低ランクは一階のみ入域できる。",
      ],
      system: "経験値は討伐条件で変動する。",
      timeline: "ダンジョン出現後、公社制度が作られた。",
      factions: [{ name: "公社", summary: "探索者制度を管理する組織。" }],
      history: {
        timeline: [
          {
            year_or_era: "20年前",
            event: "最初のダンジョンが出現した。",
            impact: "探索者制度の起点になった。",
          },
        ],
      },
      power_system_logic: "条件一致時に補正が乗る。",
      cosmology: "ダンジョンは管理者層の実験場である。",
      economic_system: "素材市場が都市経済を支える。",
      social_strata: "ランクが身分のように扱われる。",
      daily_life_textures: "深夜コンビニと探索者窓口が隣接する。",
      language_and_naming: "公社用語は事務的で冷たい。",
      forbidden_lore: [
        {
          secret: "ナビは失われた人格の残響である。",
          revealed_in_volume: 3,
          setup_episodes: [1, 2],
        },
      ],
      lexicon: { forbidden_terms_global: ["実在商標"] },
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生レン",
        role: "protagonist" as never,
        spec: { visual_description: "黒フードの青年" },
        attribute_classifier: {},
        continuity_anchors: ["黒フード"],
        appears_in_volumes: [1],
        appearance_notes: "黒フードと疲れた目。",
        backstory: "十五歳の鑑定でFランクになった。",
        childhood_episodes: ["灯里と訓練場に通った。"],
        psychology_deep: "怒る資格すら失った痛みを抱く。",
        defense_mechanisms: "諦めたふりで傷を隠す。",
        worldview_filter: "制度の入口で人を見る。",
        typical_day_in_life: "夜勤明けに一階ダンジョンへ向かう。",
        voice_samples: [{ line: "まだ戻れる。", intent: "establish" }],
        relationship_per_partner: [
          {
            partner_id: "char_antagonist",
            description: "制度側の敵意を受ける。",
          },
        ],
        growth_per_volume: [
          { volume: 1, description: "最初の勝利で逃げ場を失う。" },
        ],
      },
      {
        id: "char_antagonist",
        name: "氷室玲二",
        role: "antagonist" as never,
        spec: { visual_description: "銀縁眼鏡の監査官" },
        attribute_classifier: {},
        continuity_anchors: ["銀縁眼鏡"],
        appears_in_volumes: [1],
        backstory: "制度に人生を預けてきた。",
        psychology_deep: "例外を不正として処理したい。",
        origin_wound_deep: "努力が制度に認められた経験に縛られている。",
        ideology_argument: "制度がなければ弱者は守れないと信じる。",
        dark_mirror_to_protagonist: "制度を憎むレンの反転像。",
      },
    ],
    locations: [
      {
        id: "loc_store",
        name: "ブルーゲートマート",
        location_type: "other" as never,
        spec: {
          visual_description: "青白い深夜店舗",
          who_typically_inhabits: "夜勤労働者と探索者予備軍。",
          iconic_objects: [
            { name: "自動ドア", description: "入口チャイムが鳴る。" },
          ],
        },
        continuity_anchors: ["青白い看板"],
        appears_in_episodes: [1],
      },
    ],
    props: [
      {
        id: "prop_phone",
        name: "ヒビ入り端末",
        owner_character_id: "char_ren",
        spec: { visual_description: "画面にヒビが入った端末" },
        continuity_anchors: ["画面のヒビ"],
      },
    ],
    costumes: [
      {
        id: "costume_ren_work",
        character_id: "char_ren",
        valid_from_episode: 1,
        valid_until_episode: null,
        spec: { outfit_description: "黒フードと作業ズボン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_ren",
        to_character_id: "char_antagonist",
        relation_type: "rivals_with",
        description: "制度を挟んで対立する。",
      },
    ],
    style_directives: {
      global: "線は細く、背景は白を基調にする。",
      scene_overrides: {},
      overlay_rules: [],
    },
    visual_motifs: [
      {
        name: "左半歩",
        meaning: "自分で選ぶ余白。",
        draw_directive: "足元の小さなズレで描く。",
      },
    ],
    continuity_seeds: [
      {
        group_id: "char_ren_face_v1",
        kind: "character_face",
        target_id: "char_ren",
        invariant_description: "疲れた目元。",
      },
    ],
    volume_synopsis: {
      theme: "制度の外から入口を開く。",
      summary: "レンがナビの声で最初の勝利を得る。",
      cliffhanger: "声が沈黙する。",
    },
  } as unknown as BibleSnapshotV2;
}
