/**
 * L13 KDP 関連モジュールの smoke test
 *
 * 用途: a07 ep1 の本物 bubbles が無い状態でも、preflight / release-ledger /
 *       disclosure / kdp-input-md のロード可能性と振る舞いを smoke 検証する。
 *
 * 実行: npx tsx scripts/manga/_smoke-l13-preflight.ts
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runPreflight, formatPreflightReport } from "../../src/lib/manga/publish-v2/kdp/preflight";
import {
  renderDisclosureText,
  DEFAULT_AI_DISCLOSURE_FLAGS,
  DEFAULT_AI_TOOLS_USED,
  validateAiDisclosure,
} from "../../src/lib/manga/disclosure";
import {
  makeInitialRelease,
  applyUpdates,
  setStatus,
} from "../../src/lib/manga/publish-v2/kdp/release-ledger";
import { buildKdpInputMd } from "../../src/lib/manga/publish-v2/kdp/kdp-input-md";
import type { KdpMetadata, KdpRelease } from "../../src/lib/manga/schemas-v2";

async function main() {
  let failures = 0;

  console.log("=== 1. disclosure render ===");
  const text = renderDisclosureText(DEFAULT_AI_DISCLOSURE_FLAGS, "full_ai", DEFAULT_AI_TOOLS_USED);
  console.log(text);
  if (!text.includes("gpt-image-2")) { console.error("FAIL: tools not in text"); failures++; }

  console.log("\n=== 2. validateAiDisclosure ===");
  const v1 = validateAiDisclosure(undefined, undefined, undefined);
  console.log("undefined/undefined/undefined ->", v1);
  if (v1.ok) { console.error("FAIL: should be invalid"); failures++; }

  const v2 = validateAiDisclosure(DEFAULT_AI_DISCLOSURE_FLAGS, "full_ai", []);
  console.log("flags/full_ai/[] ->", v2);
  if (v2.ok) { console.error("FAIL: empty tools should fail"); failures++; }

  const v3 = validateAiDisclosure(DEFAULT_AI_DISCLOSURE_FLAGS, "full_ai", ["gpt-image-2"]);
  console.log("flags/full_ai/[gpt-image-2] ->", v3);
  if (!v3.ok) { console.error("FAIL: should be valid"); failures++; }

  console.log("\n=== 3. release-ledger init + applyUpdates ===");
  const rel0 = makeInitialRelease({
    slug: "_smoke",
    volumeNo: 1,
    manuscriptPdfPath: "/tmp/m.pdf",
    coverPdfPath: "/tmp/c.pdf",
  });
  console.log("init status=", rel0.status, "history=", rel0.edit_history.length);
  if (rel0.status !== "draft") { console.error("FAIL: initial status should be draft"); failures++; }
  if (rel0.edit_history.length !== 1) { console.error("FAIL: history should have 1 entry"); failures++; }

  const rel1 = applyUpdates(rel0, {
    kdp_inputs: { ...rel0.kdp_inputs, title: "新タイトル", description_html: "<p>テスト</p>" },
  }, "smoke test");
  if (rel1.kdp_inputs.title !== "新タイトル") { console.error("FAIL: title not applied"); failures++; }
  if (rel1.edit_history.length !== 2) { console.error("FAIL: history not appended"); failures++; }

  const rel2 = setStatus(rel1, "preflight_ok", "smoke");
  if (rel2.status !== "preflight_ok") { console.error("FAIL: status not changed"); failures++; }

  console.log("\n=== 4. preflight (failing: 22p + spine text + missing files + AI undefined) ===");
  const r1 = await runPreflight({
    manuscriptPdfPath: "/tmp/nonexistent-m.pdf",
    coverPdfPath: "/tmp/nonexistent-c.pdf",
    pageCount: 22,
    spineWidthMm: 5,
    metadata: { title: "T", ai_disclosure: undefined as never, ai_tools_used: [] },
    release: rel0,
    spineTextRendered: true,
    allowShortVolume: false,
  });
  console.log(formatPreflightReport(r1));
  console.log("ok=", r1.ok);
  if (r1.ok) { console.error("FAIL: should fail"); failures++; }
  const codes1 = r1.issues.map((i) => i.code);
  for (const expected of [
    "PAGES_BELOW_KDP_MIN",
    "SPINE_TEXT_FORBIDDEN_UNDER_79P",
    "COVER_FRONT_PNG_MISSING",
    "AI_DISCLOSURE_INVALID",
    "MANUSCRIPT_NOT_FOUND",
    "COVER_PDF_NOT_FOUND",
  ]) {
    if (!codes1.includes(expected)) {
      console.error(`FAIL: expected code ${expected} not in issues`);
      failures++;
    }
  }

  console.log("\n=== 5. preflight (allow-short-volume + spine text but 79p+ + AI valid + files missing) ===");
  const r2 = await runPreflight({
    manuscriptPdfPath: "/tmp/nonexistent-m.pdf",
    coverPdfPath: "/tmp/nonexistent-c.pdf",
    pageCount: 100,
    spineWidthMm: 8,
    metadata: {
      title: "テスト",
      ai_disclosure: DEFAULT_AI_DISCLOSURE_FLAGS,
      ai_tools_used: ["gpt-image-2"],
    },
    release: rel2,
    aiUsageLevel: "full_ai",
    spineTextRendered: true,
    allowShortVolume: true,
  });
  console.log(formatPreflightReport(r2));
  const codes2 = r2.issues.map((i) => i.code);
  // 79p以上なので SPINE_TEXT_FORBIDDEN は出ないはず
  if (codes2.includes("SPINE_TEXT_FORBIDDEN_UNDER_79P")) {
    console.error("FAIL: 79p+ should allow spine text");
    failures++;
  }
  // ファイル無いので MANUSCRIPT_NOT_FOUND / COVER_PDF_NOT_FOUND は出る
  if (!codes2.includes("MANUSCRIPT_NOT_FOUND") || !codes2.includes("COVER_PDF_NOT_FOUND")) {
    console.error("FAIL: missing files not detected");
    failures++;
  }

  console.log("\n=== 6. kdp-input.md generation ===");
  const tmpMd = path.join("/tmp", `_smoke_kdp_input_${Date.now()}.md`);
  const meta: KdpMetadata = {
    schema_version: 2,
    slug: "_smoke",
    volume_no: 1,
    title: "Smoke Test",
    subtitle: "第1巻",
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
  const populated: KdpRelease = applyUpdates(rel2, {
    kdp_inputs: {
      ...rel2.kdp_inputs,
      title: "Smoke Test",
      subtitle: "第1巻",
      description_html: "<p>これは smoke test の説明文です。</p>",
      keywords: ["異世界", "ダンジョン", "システム音声", "成り上がり"],
      categories: ["コミック・グラフィックノベル > 漫画 > アクション"],
    },
  });
  const md = await buildKdpInputMd({
    release: populated,
    metadata: meta,
    aiUsageLevel: "full_ai",
    outputPath: tmpMd,
  });
  console.log("kdp-input.md ->", md.outputPath);
  const mdContent = await fs.readFile(md.outputPath, "utf-8");
  for (const expected of ["# KDP 入稿チェックリスト", "AI 生成コンテンツ申告", "Smoke Test", "異世界", "gpt-image-2"]) {
    if (!mdContent.includes(expected)) {
      console.error(`FAIL: expected "${expected}" in MD`);
      failures++;
    }
  }
  await fs.unlink(md.outputPath);

  console.log("\n=== smoke summary ===");
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
