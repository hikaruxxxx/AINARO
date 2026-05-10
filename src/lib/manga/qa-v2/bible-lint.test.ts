import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { complianceLint, lintBible } from "./bible-lint";

function baseBible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  const bible = {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "qa-v2-test",
      title: "架空都市の見習い",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      core_hook: {
        one_liner: "迷宮の地図を縫う",
        type: "A",
        hit_references: ["参考作A"],
      },
    },
    world: {
      premise:
        "地下迷宮が日常の物流と結びついた架空都市で、見習いたちが小さな配達仕事を通じて都市の歪みを知っていく。",
      rules: ["迷宮入口は登録制", "深層ほど時間が遅い", "道具は記名制", "救助班が巡回する", "記録石が通行履歴を残す"],
      system: "迷宮管理局が通行証と報酬を管理する。",
      timeline: "第一巻は春の登録試験から初任務まで。",
      factions: [
        { name: "迷宮管理局", summary: "通行証と安全基準を管理する公的組織で、現場との温度差が火種になる。" },
        { name: "運び屋組合", summary: "迷宮内配送を請け負う職人集団で、古い慣習と新人教育を重んじる。" },
        { name: "露店街", summary: "迷宮素材を売買する商人たちの集まりで、情報の流通源にもなる。" },
      ],
    },
    characters: [
      {
        id: "char_aoi",
        name: "青井レン",
        role: "protagonist",
        spec: {
          hair: { style: "short", color: "black", specific: "左側だけ跳ねた短髪" },
          outfit_default: { top: "灰色の作業上着", bottom: "黒い作業ズボン" },
        },
        attribute_classifier: {},
        continuity_anchors: ["左側だけ跳ねた短髪", "古い布製の配達鞄", "緊張時に袖口を握る"],
        appears_in_volumes: [1],
        appearance_notes:
          "小柄だが足運びは速い。視線を正面から少し外し、考える時は配達鞄の留め具に触れる。笑う時だけ肩の力が抜ける。",
      },
    ],
    locations: [
      {
        id: "loc_arcade",
        name: "灯町アーケード",
        location_type: "city",
        spec: {
          layout: { furniture: [{ type: "掲示板", position: "入口右手" }] },
        },
        continuity_anchors: ["入口右手の掲示板", "天井の古い照明"],
        appears_in_episodes: [1],
      },
    ],
    props: [
      {
        id: "prop_bag",
        name: "古い配達鞄",
        spec: { kind: "bag", color: "brown" },
        continuity_anchors: ["右下の補修跡"],
      },
    ],
    costumes: [
      {
        id: "costume_work",
        character_id: "char_aoi",
        valid_from_episode: 1,
        valid_until_episode: null,
        spec: { top: "灰色の作業上着", bottom: "黒い作業ズボン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_aoi",
        to_character_id: "char_mentor",
        relation_type: "mentor",
        description: "現場でだけ厳しい先輩と新人の関係。",
      },
    ],
    style_directives: { global: "線は細く、生活感を優先する。", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [{ name: "ほどけた紐", meaning: "未熟さ", draw_directive: "鞄の留め紐を反復する" }],
    continuity_seeds: [
      {
        group_id: "char_aoi_face_v1",
        kind: "character_face",
        target_id: "char_aoi",
        invariant_description: "左側だけ跳ねた短髪と細い眉。",
      },
    ],
    volume_synopsis: {
      theme: "仕事を通じた自立",
      summary:
        "新人配達員のレンは、初任務で小さな失敗を重ねながら迷宮都市の規則と人間関係を学ぶ。先輩の厳しさが単なる冷淡さではなく過去の事故に由来すると知り、二人は危険な配送依頼を通じて互いの弱さを認める。終盤では記録石の改ざん疑惑が浮かび、日常の仕事が都市全体の秘密につながっていく。",
    },
    ...patch,
  };
  return bible as unknown as BibleSnapshotV2;
}

function bibleWithLocationName(name: string): BibleSnapshotV2 {
  const current = baseBible();
  return {
    ...current,
    locations: [{ ...current.locations[0], name }],
  };
}

describe("complianceLint", () => {
  it("ローソンが含まれる bible で fatal finding を返す", async () => {
    const findings = await complianceLint({ bible: bibleWithLocationName("ローソン灯町店") });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        scope: "location",
        target_id: "loc_arcade",
        rule: "compliance:trademarks.convenience_stores",
      }),
    );
  });

  it("NG 語なしのクリーンな bible では空配列を返す", async () => {
    await expect(complianceLint({ bible: baseBible() })).resolves.toEqual([]);
  });

  it("blocklist パスが存在しない場合は info finding を返して止まらない", async () => {
    const findings = await complianceLint({
      bible: baseBible(),
      blocklistPath: "data/manga/compliance/__missing_blocklist__.json",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual(
      expect.objectContaining({
        severity: "info",
        scope: "compliance",
        rule: "compliance_load_failed",
      }),
    );
  });

  it("locations[0].name の finding を location scope と target_id に変換する", async () => {
    const findings = await complianceLint({ bible: bibleWithLocationName("ローソン灯町店") });
    const finding = findings.find((item) => item.rule === "compliance:trademarks.convenience_stores");

    expect(finding).toEqual(
      expect.objectContaining({
        scope: "location",
        target_id: "loc_arcade",
      }),
    );
    expect(finding?.message).toContain("@ locations[0].name");
  });
});

describe("lintBible compliance integration", () => {
  it("skipCompliance: true では compliance findings が混入しない", async () => {
    const report = await lintBible({
      bible: bibleWithLocationName("ローソン灯町店"),
      skipLlm: true,
      skipCompliance: true,
      skipDepth: true,
    });

    expect(report.findings.some((finding) => finding.rule.startsWith("compliance:"))).toBe(false);
    expect(report.findings.some((finding) => finding.rule === "compliance_load_failed")).toBe(false);
  });
});

describe("lintBible depth integration", () => {
  it("skipDepth: true では depth findings が混入しない", async () => {
    const report = await lintBible({
      bible: baseBible(),
      skipLlm: true,
      skipCompliance: true,
      skipDepth: true,
    });

    expect(report.findings.some((finding) => finding.rule.startsWith("depth:"))).toBe(false);
  });

  it("skipDepth なしでは 4段階目の depth findings を合算する", async () => {
    const report = await lintBible({
      bible: baseBible(),
      skipLlm: true,
      skipCompliance: true,
    });

    expect(report.findings.some((finding) => finding.rule === "depth:characters[role=protagonist].backstory")).toBe(true);
    expect(report.summary).toMatch(/fatal=\d+ warn=\d+ info=\d+/u);
  });
});
