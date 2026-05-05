/**
 * Week 2 (Track C-1 + D-2) smoke test
 *
 * 対象:
 *   1. Zod schema (KdpMetadata / RefsProvenance / WorkMetaJson)
 *   2. provenance.ts strict reject (transitive + trademark)
 *   3. input-hash.ts (L1-L8 cache hit / L9+ 監査ログ)
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  KdpMetadataSchema,
  RefsProvenanceSchema,
  WorkMetaJsonSchema,
  parseOrThrow,
} from "../../src/lib/manga/schemas-v2.zod";
import {
  isAllowedForProductionStrict,
  auditProvenanceStrict,
  makeProvenanceEntry,
} from "../../src/lib/manga/bible/provenance";
import {
  shouldRunLayer,
  recordLayerRun,
  inputHashPath,
} from "../../src/lib/manga/cache/input-hash";
import { DEFAULT_AI_DISCLOSURE_FLAGS } from "../../src/lib/manga/disclosure";
import type { RefsProvenance, KdpMetadata } from "../../src/lib/manga/schemas-v2";

let failures = 0;
function fail(msg: string) {
  console.error("FAIL:", msg);
  failures++;
}

async function smokeZod() {
  console.log("=== 1. Zod schema ===");

  // 1a. KdpMetadata 正しい
  const validKdp: KdpMetadata = {
    schema_version: 2,
    slug: "_smoke",
    volume_no: 1,
    title: "テスト",
    author_pen_name: "AINARO",
    bisac_categories: ["COM004000"],
    ai_disclosure: DEFAULT_AI_DISCLOSURE_FLAGS,
    ai_tools_used: ["gpt-image-2"],
    human_review_performed: true,
    page_count: 100,
    spine_width_mm: 8,
    publication_date: "2026-06-01",
    manuscript_pdf_path: "/tmp/m.pdf",
    cover_pdf_path: "/tmp/c.pdf",
  };
  try {
    parseOrThrow(KdpMetadataSchema, validKdp, "valid KdpMetadata");
    console.log("  OK: valid KdpMetadata parsed");
  } catch (e) {
    fail(`valid KdpMetadata should parse: ${e}`);
  }

  // 1b. KdpMetadata 不正 (publication_date が不正な形式)
  try {
    parseOrThrow(KdpMetadataSchema, { ...validKdp, publication_date: "2026/06/01" }, "bad date");
    fail("bad date should not parse");
  } catch {
    console.log("  OK: bad date rejected");
  }

  // 1c. KdpMetadata 矛盾 (ai_tools_used 空 + ai_disclosure に true)
  try {
    parseOrThrow(KdpMetadataSchema, { ...validKdp, ai_tools_used: [] }, "tools empty contradiction");
    fail("contradiction should not parse");
  } catch {
    console.log("  OK: tools empty + disclosure true rejected");
  }

  // 1d. WorkMetaJson 通る (a07 構造)
  const a07Meta = {
    schema_version: 1,
    slug: "a07-modern-dungeon",
    title: "Fランク探索者",
    title_short: "Fランク",
    genre: "modern_dungeon",
    art_style: "manga_bw_seinen_urban",
    extra_field_should_be_allowed: "yes",
  };
  try {
    parseOrThrow(WorkMetaJsonSchema, a07Meta, "a07 meta");
    console.log("  OK: a07 meta parsed (passthrough)");
  } catch (e) {
    fail(`a07 meta should parse: ${e}`);
  }

  // 1e. RefsProvenance 通る (1 entry)
  const provenance: RefsProvenance = {
    schema_version: 1,
    refs: [
      makeProvenanceEntry({
        asset_id: "char_a_front",
        path: "/tmp/a.png",
        target_entity_id: "char_a",
        target_entity_type: "character",
        variant: "front",
      }),
    ],
  };
  try {
    parseOrThrow(RefsProvenanceSchema, provenance, "provenance");
    console.log("  OK: provenance parsed");
  } catch (e) {
    fail(`provenance should parse: ${e}`);
  }
}

async function smokeProvenance() {
  console.log("\n=== 2. provenance strict reject ===");

  // 2a. trademark未チェック → reject
  const e1 = makeProvenanceEntry({
    asset_id: "a1",
    path: "/tmp/a1.png",
    target_entity_id: "char_a",
    target_entity_type: "character",
    variant: "front",
  });
  const r1 = isAllowedForProductionStrict(e1, { schema_version: 1, refs: [e1] });
  if (r1.ok) fail("trademark未チェック should be rejected");
  else console.log("  OK: trademark pending rejected:", r1.reason);

  // 2b. trademark passed → ok
  const e2 = { ...e1, trademark_check_status: "passed" as const };
  const r2 = isAllowedForProductionStrict(e2, { schema_version: 1, refs: [e2] });
  if (!r2.ok) fail(`trademark passed should ok: ${(r2 as { reason: string }).reason}`);
  else console.log("  OK: trademark passed approved");

  // 2c. transitive reject (祖先が kindle_archive)
  const ancestor = makeProvenanceEntry({
    asset_id: "kindle_ref_1",
    path: "/tmp/k.png",
    target_entity_id: "global",
    target_entity_type: "style",
    variant: "ref",
    source_type: "kindle_archive",
    rights_status: "internal_only",
    trademark_check_status: "passed",
  });
  const derived = {
    ...e2,
    asset_id: "derived_1",
    learning_source_chain: ["kindle_ref_1"],
  };
  const provenance: RefsProvenance = { schema_version: 1, refs: [ancestor, derived] };
  const r3 = isAllowedForProductionStrict(derived, provenance);
  if (r3.ok) fail("transitive reject failed");
  else console.log("  OK: transitive reject:", r3.reason);

  // 2d. auditProvenanceStrict
  const audit = auditProvenanceStrict(provenance);
  if (audit.ok) fail("audit should fail");
  console.log(`  OK: audit detected ${audit.rejected.length} rejections`);
}

async function smokeInputHash() {
  console.log("\n=== 3. input-hash ===");

  // a07 が前提なのでテスト用 slug を一時作成
  const slug = "_smoke_hash";
  const tmpRoot = path.join(os.tmpdir(), `ainaro_smoke_${Date.now()}`);
  await fs.mkdir(tmpRoot, { recursive: true });
  const dummyFile = path.join(tmpRoot, "dummy.json");
  await fs.writeFile(dummyFile, JSON.stringify({ a: 1, b: 2 }));

  // 一時 slug の WORKS_DIR は固定なので、_paths.workDir() が使う AINARO_REPO_ROOT
  // を一時的に切り替えるのは大袈裟。代わりに既存 workDir 配下の `_smoke_hash/_cache/` を
  // 後始末する形で一時利用する。
  try {
    const inputs = [{ path: dummyFile, kind: "file" as const }];

    // L3 (deterministic) — 1 回目: cache miss
    const r1 = await shouldRunLayer({ slug, layer: "L3", scope: "ep01", inputs });
    if (r1.run !== true || r1.reason !== "no-cache") fail(`L3 first run expected no-cache, got ${r1.reason}`);
    else console.log("  OK: L3 first run -> no-cache");
    await recordLayerRun({ slug, newRecord: r1.newRecord });

    // L3 — 2 回目: cache hit
    const r2 = await shouldRunLayer({ slug, layer: "L3", scope: "ep01", inputs });
    if (r2.run !== false || r2.reason !== "cache-hit") fail(`L3 second run expected cache-hit, got ${r2.reason}`);
    else console.log("  OK: L3 second run -> cache-hit");

    // L3 — 入力変更後: hash-mismatch
    await fs.writeFile(dummyFile, JSON.stringify({ a: 1, b: 999 }));
    const r3 = await shouldRunLayer({ slug, layer: "L3", scope: "ep01", inputs });
    if (r3.run !== true || r3.reason !== "hash-mismatch") fail(`L3 mismatch expected, got ${r3.reason}`);
    else console.log("  OK: L3 input changed -> hash-mismatch");

    // L9 (non-deterministic) — 常に run=true
    const r4 = await shouldRunLayer({ slug, layer: "L9", scope: "ep01", inputs });
    if (r4.run !== true || r4.reason !== "non-deterministic") fail(`L9 expected non-deterministic, got ${r4.reason}`);
    else console.log("  OK: L9 -> non-deterministic (run=true, hash recorded only)");
    await recordLayerRun({ slug, newRecord: r4.newRecord });

    // 監査ログとして hash ファイルが存在するか確認
    const hashPath = inputHashPath(slug, "L9", "ep01");
    const exists = await fs.access(hashPath).then(() => true).catch(() => false);
    if (!exists) fail("L9 hash file should be saved for audit");
    else console.log("  OK: L9 hash recorded for audit");
  } finally {
    // 後始末
    await fs.rm(tmpRoot, { recursive: true, force: true });
    const cacheDir = path.join(
      "/Users/hikarumori/Developer/AINARO/data/manga/works",
      slug,
      "_cache",
    );
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
}

async function main() {
  await smokeZod();
  await smokeProvenance();
  await smokeInputHash();
  console.log("\n=== summary ===");
  if (failures === 0) {
    console.log("ALL OK");
  } else {
    console.error(`FAILED: ${failures} 件`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
