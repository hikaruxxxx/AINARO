import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";
import { auditBibleFacts, extractBibleFacts, extractStoryboardHits } from "./bible-facts-audit";

function bibleStub(overrides: Partial<BibleSnapshotV2["world"]> = {}): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-17T00:00:00.000Z",
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
      system: "全人類は18歳までに鑑定石でS/A/B/C/D/E/Fの七段階の適性ランクを判定される。",
      timeline: "20年前、地表世界の複数都市地下に巨大な接続口が開いた。",
      factions: [],
      lexicon: { forbidden_terms_global: [] },
      ...overrides,
    },
    characters: [],
    locations: [],
    props: [],
    costumes: [],
    relations: [],
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "test", summary: "test" },
    style_directives: { global: "", digest: "" } as BibleSnapshotV2["style_directives"],
  } as unknown as BibleSnapshotV2;
}

function storyboardWithNarration(narration: string[]): EpisodeStoryboardV2 {
  return {
    schema_version: 2,
    pages: [
      {
        page_no: 1,
        page_role: "opening_hook",
        panels: [
          {
            panel_id: "p001",
            panel_no: 1,
            reading_order: 1,
            shot_type: "establishing",
            camera: "high_angle",
            bleed: true,
            silence: false,
            importance: 5,
            entities: {
              characters: [],
              location_id: "loc_test",
              props: [],
              focus_entity_id: "loc_test",
            },
            action: "テスト action",
            key_visual: "テスト visual",
            dialogue: [],
            monologue: [],
            narration,
            sfx: [],
          },
        ],
      },
    ],
  } as unknown as EpisodeStoryboardV2;
}

describe("bible-facts-audit", () => {
  it("extractBibleFacts は timeline/system から年代と年齢を抽出する", () => {
    const facts = extractBibleFacts(bibleStub());
    expect(facts.yearsAgo).toContain(20);
    expect(facts.ages).toContain(18);
  });

  it("extractBibleFacts は漢数字も抽出する", () => {
    const facts = extractBibleFacts(
      bibleStub({
        timeline: "二十年前、世界は変わった。",
        system: "十八歳までに鑑定する。",
      }),
    );
    expect(facts.yearsAgo).toContain(20);
    expect(facts.ages).toContain(18);
  });

  it("extractStoryboardHits は narration 内の数値を panel ごとに収集する", () => {
    const sb = storyboardWithNarration([
      "三年前、世界中の都市の地下にダンジョンが現れた。",
      "十五歳で受ける鑑定石の判定が、人生の入口を決める。",
    ]);
    const hits = extractStoryboardHits(sb);
    expect(hits).toHaveLength(2);
    expect(hits[0].yearsAgo).toEqual([3]);
    expect(hits[1].ages).toEqual([15]);
  });

  it("auditBibleFacts: bible 「20年前」+ storyboard 「三年前」で years_ago_mismatch warning", () => {
    const bible = bibleStub();
    const sb = storyboardWithNarration(["三年前、世界中の都市の地下にダンジョンが現れた。"]);
    const { findings } = auditBibleFacts(bible, sb);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const yearsFinding = findings.find((f) => f.kind === "years_ago_mismatch");
    expect(yearsFinding).toBeDefined();
    expect(yearsFinding?.found).toBe(3);
    expect(yearsFinding?.expected).toContain(20);
  });

  it("auditBibleFacts: bible「18歳まで」+ storyboard「15歳」は範囲内なので findings 0 (18歳以下は許容)", () => {
    const bible = bibleStub();
    const sb = storyboardWithNarration(["十五歳の鑑定回想へ入る。"]);
    const { findings } = auditBibleFacts(bible, sb);
    const ageFindings = findings.filter((f) => f.kind === "age_mismatch");
    expect(ageFindings).toHaveLength(0);
  });

  it("auditBibleFacts: bible「18歳」+ storyboard「25歳」は超過なので warning", () => {
    const bible = bibleStub();
    const sb = storyboardWithNarration(["25歳のレンは、過去を振り返る。"]);
    const { findings } = auditBibleFacts(bible, sb);
    const ageFindings = findings.filter((f) => f.kind === "age_mismatch");
    expect(ageFindings).toHaveLength(1);
    expect(ageFindings[0].found).toBe(25);
  });

  it("auditBibleFacts: bible 準拠 narration (20年前 + 18歳) は findings 0", () => {
    const bible = bibleStub();
    const sb = storyboardWithNarration([
      "20年前、世界中の都市の地下にダンジョンが現れた。",
      "18歳までに受ける鑑定石が、S〜Fの一字で人生の入口を決める。",
    ]);
    const { findings } = auditBibleFacts(bible, sb);
    expect(findings).toHaveLength(0);
  });

  describe("Sprint 14 案1: bible.meta.quantitative_facts 優先参照", () => {
    it("extractBibleFacts: 構造化 quantitative_facts があれば優先採用 (regex と統合)", () => {
      const bible = bibleStub({
        // bible.world.timeline / system からは数値を抜く (regex は何も拾わない)
        timeline: "ある日、世界は静かに変わった。",
        system: "誰もが鑑定石で人生を決められる。",
      });
      bible.meta.quantitative_facts = {
        years_ago: [20],
        judgement_age_max: 18,
        ranks: ["S", "A", "B", "C", "D", "E", "F"],
      };
      const facts = extractBibleFacts(bible);
      expect(facts.yearsAgo).toContain(20);
      expect(facts.ages).toContain(18);
    });

    it("extractBibleFacts: 構造化と regex の値が両方あればマージされる", () => {
      const bible = bibleStub({
        timeline: "30年前にもう一つの事件があった。",
        system: "別の世界では15歳までに判定する。",
      });
      bible.meta.quantitative_facts = {
        years_ago: [20],
        judgement_age_max: 18,
      };
      const facts = extractBibleFacts(bible);
      expect(facts.yearsAgo).toContain(20); // 構造化
      expect(facts.yearsAgo).toContain(30); // regex
      expect(facts.ages).toContain(18); // 構造化
      expect(facts.ages).toContain(15); // regex
    });

    it("auditBibleFacts: 構造化 facts のみで storyboard の bible 逸脱を検出", () => {
      const bible = bibleStub({ timeline: "", system: "", premise: "" });
      bible.meta.quantitative_facts = { years_ago: [20], judgement_age_max: 18 };
      const sb = storyboardWithNarration(["三年前、世界中の都市の地下にダンジョンが現れた。"]);
      const { findings } = auditBibleFacts(bible, sb);
      const yearsFinding = findings.find((f) => f.kind === "years_ago_mismatch");
      expect(yearsFinding).toBeDefined();
      expect(yearsFinding?.found).toBe(3);
      expect(yearsFinding?.expected).toContain(20);
    });
  });
});
