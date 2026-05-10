import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { loadBlocklist, loadFalsePositives, scanBible, scanPrompt, scanText } from "./scanner";

async function dictionaries() {
  const [blocklist, fp] = await Promise.all([loadBlocklist(), loadFalsePositives()]);
  return { blocklist, fp };
}

function bibleWithLocationName(name: string): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
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
    world: { premise: "", rules: [], system: "", timeline: "", factions: [] },
    characters: [],
    locations: [
      {
        id: "loc_store",
        name,
        location_type: "city",
        spec: {},
        continuity_anchors: [],
        appears_in_episodes: [1],
      },
    ],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "", summary: "" },
  } as unknown as BibleSnapshotV2;
}

describe("manga compliance scanner", () => {
  it("detects ローソン as fatal with suggestion", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("ローソン新宿西", blocklist, fp);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "fatal",
      category: "trademarks.convenience_stores",
      matched_term: "ローソン",
      position: 0,
    });
    expect(findings[0]?.suggestion?.type).toBe("convenience_store");
  });

  it("detects セブンイレブン in prose", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("店内にはセブンイレブンが入っていた", blocklist, fp);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.matched_term).toBe("セブンイレブン");
    expect(findings[0]?.severity).toBe("fatal");
  });

  it("skips マック inside クライマックス by katakana boundary", async () => {
    const { blocklist, fp } = await dictionaries();

    expect(scanText("クライマックスを迎えた", blocklist, fp)).toEqual([]);
  });

  it("skips ワンピース when used as clothing without commercial context", async () => {
    const { blocklist, fp } = await dictionaries();

    expect(scanText("白い研究用ワンピース", blocklist, fp)).toEqual([]);
  });

  it("detects iPhone", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("新作の iPhone を取り出した", blocklist, fp);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "fatal",
      category: "trademarks.consumer_electronics",
      matched_term: "iPhone",
    });
  });

  it("skips Apple as fruit without commercial context", async () => {
    const { blocklist, fp } = await dictionaries();

    expect(scanText("Apple のリンゴをかじった", blocklist, fp)).toEqual([]);
  });

  it("detects Apple with commercial context", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("Apple Computer 社のサービス", blocklist, fp);

    expect(findings.some((finding) => finding.matched_term === "Apple")).toBe(true);
  });

  it("detects LINE in commercial app context", async () => {
    // Phase 1-2 後、bible 本文中の「白いライン」「直線ライン」等の一般語を skip するため
    // false-positives.json で context_check_required=true にした。
    // 商業文脈語 (アプリ/会社/サービス等) があるときだけ fatal として検出する。
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("LINE アプリで連絡が来た", blocklist, fp);

    expect(findings.some((f) => f.matched_term === "LINE")).toBe(true);
  });

  it("skips ライン as general term (no commercial context)", async () => {
    // 「白いラインが引かれ」のような一般語としての「ライン」は LINE アプリではない
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("白いラインが床に引かれていた", blocklist, fp);

    // ライン / LINE 系の一致が含まれていないこと
    expect(findings.some((f) => f.matched_term === "LINE" || f.matched_term === "ライン")).toBe(false);
  });

  it("skips 新幹線 from false-positive context excludes", async () => {
    const { blocklist, fp } = await dictionaries();

    expect(scanText("新幹線に乗った", blocklist, fp)).toEqual([]);
  });

  it("reports recursive bible field_path", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanBible(bibleWithLocationName("ローソン新宿西"), blocklist, fp);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.field_path).toBe("locations[0].name");
  });

  it("returns separate findings for repeated terms", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("ローソンの隣にローソン", blocklist, fp);

    expect(findings.map((finding) => finding.position)).toEqual([0, 7]);
    expect(findings.every((finding) => finding.matched_term === "ローソン")).toBe(true);
  });

  it("distinguishes fatal and warn severity", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanText("iPhone と JR東日本", blocklist, fp);

    expect(findings.find((finding) => finding.matched_term === "iPhone")?.severity).toBe("fatal");
    expect(findings.find((finding) => finding.matched_term === "JR東日本")?.severity).toBe("warn");
  });

  it("normalizes full-width latin text before matching", async () => {
    const { blocklist, fp } = await dictionaries();
    const findings = scanPrompt("新作の ｉＰｈｏｎｅ を取り出した", blocklist, fp);

    expect(findings[0]).toMatchObject({
      field_path: "prompt",
      matched_term: "iPhone",
    });
  });
});
