/**
 * @deprecated Phase β B5-4 (2026-05-07) で deprecated 化。
 *
 * 旧仕様: a07 ep01 storyboard.json に panel-level Codex patches (panel_insert /
 * panel_modify / page_metadata_modify) を直接適用する smoke script。
 *
 * 撤回理由: panel-level patch は scene-graph (L3.5) を経由しないため、
 * L4-1 hook / L4-9 cliffhanger と衝突して a07-ep01 で時系列逆行・台詞先出し等の
 * 構造矛盾を生んだ。詳細は docs/plans/manga/scene-graph-l3-5.md "9. L4-1 / L4-9 を scene swap" 参照。
 *
 * 代替経路 (新方式):
 *   1. scene-graph 上で swap を行う: src/lib/manga/scene-graph/scene-swap.ts
 *      - swapScenes / regenerateOpeningHookScenes / regenerateCliffhangerScene
 *   2. scene-graph から storyboard を再展開: src/lib/manga/scene-graph/storyboard-from-scenes.ts
 *      - npx tsx scripts/manga/layers/L04-storyboard.ts --slug X --episode N --from-scene-graph
 *
 * 削除予定: L04-1/L04-9 を scene swap に切り替えた段階で本ファイルを完全削除。
 * それまでは互換性のため残すが、実行時に警告を出して新規利用を抑止する。
 *
 * 設計根拠 (旧):
 *   - ユーザー指示: 全 patch 採用 (Codex 品質高、機械検証で効果が定量的に測れる)
 *   - 入力: data/eval/a07-quality-improve/codex-patches.json (6 patches)
 *   - 出力: storyboard.json を更新 (元は .backup として保存)
 *
 * 操作種別 (旧):
 *   1. panel_modify: 該当 panel の dialogue/monologue/narration/shot_type/action を proposed で上書き
 *   2. page_metadata_modify: 該当 page の panel.importance を proposed の importances 表に従って更新
 *   3. panel_insert: 新 panel を該当位置に挿入、後続の panel_no を re-index
 *
 * 使い方 (deprecated): npx tsx scripts/manga/_smoke-a07-apply-patches.ts
 */

import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  auditPage,
  auditVolume,
  type AuditFinding,
} from "../../src/lib/manga/name-preview/audit-rules";
import type {
  EpisodeStoryboardV2,
  PanelV2,
  ToneProfile,
} from "../../src/lib/manga/schemas-v2";

const ROOT = path.resolve(__dirname, "../..");
const SLUG = "a07-modern-dungeon";
const EP = 1;
const STORYBOARD_PATH = path.join(
  ROOT,
  `data/manga/works/${SLUG}/episodes/ep${String(EP).padStart(2, "0")}/storyboard.json`,
);
const BACKUP_PATH = STORYBOARD_PATH + ".pre-phase-x-patches.backup";
const PATCHES_PATH = path.join(ROOT, "data/eval/a07-quality-improve/codex-patches.json");
const REPORT_PATH = path.join(ROOT, "data/eval/a07-quality-improve/apply-patches-report.json");

const TARGET_TONE: ToneProfile = {
  darkness: 0.3,
  comedic_density: 0.8,
  recovery_cadence: 0.9,
  sidekick_presence: 0.9,
};

// ===== 型定義 =====

type PanelModifyPatch = {
  finding_rule: string;
  page_no: number;
  panel_no: number;
  scope: "panel_modify";
  proposed: Partial<PanelV2> & {
    shot_type?: string;
    importance?: number;
    action?: string;
    narration?: string[];
    monologue?: Array<{ character_id: string; text: string }>;
    dialogue?: Array<{ character_id: string; text: string }>;
    sfx?: string[];
  };
  rationale: string;
  expected_effect: string;
};

type PageMetadataModifyPatch = {
  finding_rule: string;
  page_no: number;
  scope: "page_metadata_modify";
  proposed: {
    importances: Array<{ panel_no: number; importance: number }>;
  };
  rationale: string;
  expected_effect: string;
};

type PanelInsertPatch = {
  finding_rule: string;
  scope: "panel_insert";
  insert_after_page: number;
  insert_after_panel: number;
  new_panel: {
    shot_type: string;
    importance: number;
    silence: boolean;
    action: string;
    key_visual?: string;
    dialogue: Array<{ character_id: string; text: string }>;
    monologue: Array<{ character_id: string; text: string }>;
    narration: string[];
    sfx: string[];
  };
  rationale: string;
  expected_effect: string;
};

type Patch = PanelModifyPatch | PageMetadataModifyPatch | PanelInsertPatch;

type PatchesFile = {
  patches: Patch[];
};

// ===== 適用ロジック =====

function applyPanelModify(
  storyboard: EpisodeStoryboardV2,
  patch: PanelModifyPatch,
): { ok: boolean; reason?: string } {
  for (const page of storyboard.pages) {
    if (page.page_no !== patch.page_no) continue;
    for (const panel of page.panels) {
      if (panel.panel_no !== patch.panel_no) continue;
      // proposed の各フィールドを上書き (undefined 以外)
      if (patch.proposed.shot_type !== undefined) {
        (panel as PanelV2).shot_type = patch.proposed.shot_type as PanelV2["shot_type"];
      }
      if (patch.proposed.importance !== undefined) {
        panel.importance = patch.proposed.importance;
      }
      if (patch.proposed.action !== undefined) {
        panel.action = patch.proposed.action;
      }
      if (patch.proposed.narration !== undefined) {
        panel.narration = patch.proposed.narration;
      }
      if (patch.proposed.monologue !== undefined) {
        panel.monologue = patch.proposed.monologue;
        // monologue 話者が entities に含まれていなければ voice_off で追加 (storyboard-extractor と同じロジック)
        const presentIds = new Set(panel.entities.characters.map((c) => c.character_id));
        for (const m of patch.proposed.monologue) {
          if (!presentIds.has(m.character_id)) {
            panel.entities.characters.push({
              character_id: m.character_id,
              role: "speaker",
              on_screen_via: "in_person", // 主人公の独白なので画面内想定
              expression: "neutral",
            });
            presentIds.add(m.character_id);
          }
        }
      }
      if (patch.proposed.dialogue !== undefined) {
        panel.dialogue = patch.proposed.dialogue;
      }
      if (patch.proposed.sfx !== undefined) {
        panel.sfx = patch.proposed.sfx;
      }
      return { ok: true };
    }
    return { ok: false, reason: `page ${patch.page_no} に panel#${patch.panel_no} なし` };
  }
  return { ok: false, reason: `page ${patch.page_no} 不在` };
}

function applyPageMetadataModify(
  storyboard: EpisodeStoryboardV2,
  patch: PageMetadataModifyPatch,
): { ok: boolean; reason?: string } {
  for (const page of storyboard.pages) {
    if (page.page_no !== patch.page_no) continue;
    for (const update of patch.proposed.importances) {
      const panel = page.panels.find((p) => p.panel_no === update.panel_no);
      if (!panel) {
        return { ok: false, reason: `page ${patch.page_no} に panel#${update.panel_no} なし` };
      }
      panel.importance = update.importance;
    }
    return { ok: true };
  }
  return { ok: false, reason: `page ${patch.page_no} 不在` };
}

function applyPanelInsert(
  storyboard: EpisodeStoryboardV2,
  patch: PanelInsertPatch,
): { ok: boolean; reason?: string; insertedAt?: { page: number; panel: number } } {
  // 該当 page の panels[] の insert_after_panel の直後に新 panel を挿入
  const page = storyboard.pages.find((p) => p.page_no === patch.insert_after_page);
  if (!page) return { ok: false, reason: `page ${patch.insert_after_page} 不在` };
  const idx = page.panels.findIndex((p) => p.panel_no === patch.insert_after_panel);
  if (idx < 0) return { ok: false, reason: `panel#${patch.insert_after_panel} 不在` };

  // 新 panel 作成: panel_no は既存最大 + 1 (シンプル化のため、page 内の panel_no 連番再採番はしない)
  // ※ 厳密な連番再採番は別 work item。ここでは「最大 panel_no + 1 で末尾的な panel_no を割り当てる」簡易方式
  const allPanelNos = storyboard.pages.flatMap((p) => p.panels.map((pp) => pp.panel_no));
  const maxPanelNo = Math.max(...allPanelNos);
  const newPanelNo = maxPanelNo + 1;
  const newPanelId = `p${String(newPanelNo).padStart(2, "0")}_inserted`;

  // 主人公のキャラクターIDを bible から推定 (storyboard 内に既に登場するキャラクターIDを使う)
  const mainCharIds = new Set<string>();
  for (const p of storyboard.pages) {
    for (const panel of p.panels) {
      for (const c of panel.entities.characters) {
        mainCharIds.add(c.character_id);
      }
    }
  }
  // dialogue/monologue speaker を entities.characters に追加
  const speakerIds = new Set<string>();
  for (const d of patch.new_panel.dialogue) speakerIds.add(d.character_id);
  for (const m of patch.new_panel.monologue) speakerIds.add(m.character_id);
  const charsForNewPanel = Array.from(speakerIds).map((cid) => ({
    character_id: cid,
    role: "speaker" as const,
    on_screen_via: "in_person" as const,
    expression: "neutral",
  }));

  // location_id は前 panel から継承 (簡易)
  const prevPanel = page.panels[idx];
  const newPanel: PanelV2 = {
    panel_id: newPanelId,
    panel_no: newPanelNo,
    reading_order: page.panels.length + 1, // 末尾に挿入される想定で reading_order も末尾化
    shot_type: patch.new_panel.shot_type as PanelV2["shot_type"],
    camera: "eye_level" as PanelV2["camera"],
    bleed: false,
    silence: patch.new_panel.silence,
    importance: patch.new_panel.importance,
    entities: {
      characters: charsForNewPanel,
      location_id: prevPanel.entities.location_id,
      props: [],
      focus_entity_id: charsForNewPanel[0]?.character_id ?? prevPanel.entities.location_id,
    },
    action: patch.new_panel.action,
    key_visual: patch.new_panel.key_visual ?? patch.new_panel.action,
    dialogue: patch.new_panel.dialogue,
    monologue: patch.new_panel.monologue,
    narration: patch.new_panel.narration,
    sfx: patch.new_panel.sfx,
  };

  // 該当位置に挿入
  page.panels.splice(idx + 1, 0, newPanel);
  // reading_order を 1-indexed で再採番 (page 内)
  for (let i = 0; i < page.panels.length; i++) {
    page.panels[i].reading_order = i + 1;
  }

  return { ok: true, insertedAt: { page: page.page_no, panel: newPanelNo } };
}

// ===== main =====

async function main(): Promise<void> {
  // Phase β B5-4: deprecated 警告。新規ユース禁止、既存検証専用。
  console.warn(
    "\x1b[33m[DEPRECATED]\x1b[0m _smoke-a07-apply-patches.ts は scene-graph (L3.5) 撤回経路です。" +
      "\n  panel-level patch は scene-graph と衝突するため、Phase β B5-4 で deprecated 化されました。"
  );
  console.warn(
    "  代替: npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1 --from-scene-graph"
  );
  console.warn(
    "  詳細: docs/plans/manga/scene-graph-l3-5.md '9. L4-1 / L4-9 を scene swap'"
  );
  if (!process.env.AINARO_ALLOW_DEPRECATED_PHASE_X) {
    console.error(
      "\x1b[31m[BLOCKED]\x1b[0m AINARO_ALLOW_DEPRECATED_PHASE_X=1 が設定されていない場合は実行を停止します。" +
        "\n  どうしても旧経路を使う必要がある場合は、AINARO_ALLOW_DEPRECATED_PHASE_X=1 を export してください。"
    );
    process.exit(2);
  }

  if (!existsSync(STORYBOARD_PATH)) throw new Error(`storyboard 不在: ${STORYBOARD_PATH}`);
  if (!existsSync(PATCHES_PATH)) throw new Error(`patches 不在: ${PATCHES_PATH}`);

  // バックアップ作成
  if (!existsSync(BACKUP_PATH)) {
    copyFileSync(STORYBOARD_PATH, BACKUP_PATH);
    console.log(`[backup] ${BACKUP_PATH}`);
  } else {
    console.log(`[backup] 既存あり、スキップ`);
  }

  const storyboard = JSON.parse(
    readFileSync(STORYBOARD_PATH, "utf-8"),
  ) as EpisodeStoryboardV2;
  const patchesFile = JSON.parse(readFileSync(PATCHES_PATH, "utf-8")) as PatchesFile;

  const beforePanelTotal = storyboard.pages.reduce((s, p) => s + p.panels.length, 0);

  // before audit
  const beforePageFindings: AuditFinding[] = [];
  for (const page of storyboard.pages) {
    beforePageFindings.push(...auditPage({ page, refsExists: () => true }));
  }
  const beforeVolumeFindings = auditVolume({
    episodes: [storyboard],
    toneProfile: TARGET_TONE,
  });
  const beforeAllFindings = [...beforePageFindings, ...beforeVolumeFindings];

  console.log(`[before] panels=${beforePanelTotal} findings=${beforeAllFindings.length}`);

  // 各 patch を適用
  const results: Array<{
    finding_rule: string;
    scope: string;
    ok: boolean;
    reason?: string;
    insertedAt?: { page: number; panel: number };
  }> = [];
  for (const patch of patchesFile.patches) {
    let result: { ok: boolean; reason?: string; insertedAt?: { page: number; panel: number } };
    if (patch.scope === "panel_modify") {
      result = applyPanelModify(storyboard, patch);
    } else if (patch.scope === "page_metadata_modify") {
      result = applyPageMetadataModify(storyboard, patch);
    } else if (patch.scope === "panel_insert") {
      result = applyPanelInsert(storyboard, patch);
    } else {
      result = { ok: false, reason: `unknown scope: ${(patch as { scope?: string }).scope}` };
    }
    results.push({
      finding_rule: patch.finding_rule,
      scope: patch.scope,
      ok: result.ok,
      reason: result.reason,
      insertedAt: result.insertedAt,
    });
    console.log(
      `  [${result.ok ? "OK" : "FAIL"}] ${patch.finding_rule} (${patch.scope}) ${result.reason ?? ""}`,
    );
  }

  // total_pages を更新
  storyboard.total_pages = storyboard.pages.length;
  // 適用後の panel 総数
  const afterPanelTotal = storyboard.pages.reduce((s, p) => s + p.panels.length, 0);

  // 適用後の audit
  const afterPageFindings: AuditFinding[] = [];
  for (const page of storyboard.pages) {
    afterPageFindings.push(...auditPage({ page, refsExists: () => true }));
  }
  const afterVolumeFindings = auditVolume({
    episodes: [storyboard],
    toneProfile: TARGET_TONE,
  });
  const afterAllFindings = [...afterPageFindings, ...afterVolumeFindings];

  console.log(
    `[after]  panels=${afterPanelTotal} findings=${afterAllFindings.length} (delta=${afterAllFindings.length - beforeAllFindings.length})`,
  );

  // storyboard.json を書き戻し
  writeFileSync(STORYBOARD_PATH, JSON.stringify(storyboard, null, 2), "utf-8");
  console.log(`[write] ${STORYBOARD_PATH}`);

  // レポート保存
  const beforeByRule: Record<string, number> = {};
  for (const f of beforeAllFindings) {
    beforeByRule[f.rule] = (beforeByRule[f.rule] ?? 0) + 1;
  }
  const afterByRule: Record<string, number> = {};
  for (const f of afterAllFindings) {
    afterByRule[f.rule] = (afterByRule[f.rule] ?? 0) + 1;
  }
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    slug: SLUG,
    episode: EP,
    target_tone: TARGET_TONE,
    storyboard_path: STORYBOARD_PATH,
    backup_path: BACKUP_PATH,
    before: {
      panel_total: beforePanelTotal,
      findings_total: beforeAllFindings.length,
      findings_by_rule: beforeByRule,
    },
    after: {
      panel_total: afterPanelTotal,
      findings_total: afterAllFindings.length,
      findings_by_rule: afterByRule,
      remaining_findings: afterAllFindings.map((f) => ({
        page_no: f.page_no,
        panel_no: f.panel_no,
        rule: f.rule,
        severity: f.severity,
        message: f.message,
      })),
    },
    patches_applied: results,
    summary: {
      patches_total: results.length,
      patches_ok: results.filter((r) => r.ok).length,
      patches_failed: results.filter((r) => !r.ok).length,
      findings_reduction: beforeAllFindings.length - afterAllFindings.length,
    },
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[report] ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
