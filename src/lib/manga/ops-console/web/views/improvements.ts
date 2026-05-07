/**
 * Phase Y WY-7 Console UI: 品質改善 view
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-7
 *   - ユーザー要望: 「こういう修正を Console でできるようにならない?」
 *
 * 提供:
 *   - 既存 audit findings (L11 + Phase X 新ルール) の概要表示
 *   - L4.1 Opening Hook proposals の状態 (生成済 / 未生成、推奨 pattern)
 *   - L4.9 Cliffhanger proposals の状態 + pull_link 表示
 *   - 編集判断カードDB 関連カード一覧
 *   - 「Opening Hook 生成」「Cliffhanger 生成」ボタン → /api/jobs に L04_1 / L04_9 投入
 *
 * ジョブ起動は既存 jobs-hub と同じ POST /api/jobs に投げる (LAYER_REGISTRY で許可済み)。
 * 生成完了後は再度 /api/improvements を fetch して proposals 表示。
 */

import {
  ApiError,
  apiGetImprovements,
  apiPostJob,
  openJobStream,
  type ImprovementsResponse,
  type JobState,
} from "../lib/api";
import { store } from "../lib/store";
import { openAiEditModal } from "../components/ai-edit-modal";

type Toast = {
  message: string;
  kind: "success" | "warning" | "danger" | "info";
};

type ChainStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

type ChainStep = {
  label: string;
  layer: string;
  flags: Record<string, string | true>;
  status: ChainStepStatus;
  jobId?: string;
  error?: string;
};

type ViewState = {
  slug: string;
  episode: number;
  data: ImprovementsResponse | null;
  loading: boolean;
  starting: string | null; // 起動中のジョブ label
  error: string | null;
  toast: Toast | null;
  /** Phase Y WY-12: チェーン実行 (audit → 提案適用 → 再audit) の進捗 */
  chainSteps: ChainStep[] | null;
  chainRunning: boolean;
};

const CSS = `
.imp-view { display: grid; gap: var(--space-4); max-width: 1200px; }
.imp-head { display:flex; align-items:baseline; gap:var(--space-3); flex-wrap:wrap; }
.imp-head h2 { margin:0; font-size: var(--fs-xl); }
.imp-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.imp-spacer { flex: 1 1 auto; }
.imp-section { display:grid; gap: var(--space-2); padding: var(--space-3); background: var(--surface-base); border:1px solid var(--border-default); border-radius: 8px; }
.imp-section h3 { margin: 0 0 var(--space-1); font-size: var(--fs-lg); }
.imp-section .imp-section-sub { color: var(--text-secondary); font-size: var(--fs-sm); margin-bottom: var(--space-2); }
.imp-grid { display:grid; gap: var(--space-2); grid-template-columns: 1fr 1fr; }
@media (max-width: 900px) { .imp-grid { grid-template-columns: 1fr; } }
.imp-stat-row { display:flex; gap: var(--space-3); flex-wrap: wrap; font-size: var(--fs-sm); }
.imp-stat-row dt { color: var(--text-secondary); }
.imp-stat-row dd { margin: 0; font-weight: 600; }
.imp-finding { display:grid; gap: 4px; padding: 6px 10px; border-left: 3px solid var(--color-warning); background: var(--surface-subtle); border-radius: 4px; font-size: var(--fs-xs); }
.imp-finding--error { border-left-color: var(--color-danger); }
.imp-finding--info { border-left-color: var(--color-primary); }
.imp-finding-meta { color: var(--text-secondary); }
.imp-pattern-list { display:flex; gap: 6px; flex-wrap: wrap; }
.imp-pattern-tag { padding: 2px 8px; border: 1px solid var(--border-default); border-radius: 999px; font-size: var(--fs-xs); background: var(--surface-subtle); }
.imp-pattern-tag--recommended { background: var(--color-primary); color: white; border-color: var(--color-primary); }
.imp-action-row { display:flex; gap: var(--space-2); align-items:center; flex-wrap: wrap; padding: var(--space-2); background: var(--surface-subtle); border-radius: 6px; }
.imp-action-row .imp-action-desc { color: var(--text-secondary); font-size: var(--fs-xs); flex: 1 1 auto; }
.imp-pull-link { padding: var(--space-2); background: var(--surface-subtle); border-radius: 6px; font-size: var(--fs-sm); }
.imp-pull-link strong { color: var(--text-primary); }
.imp-empty { padding: var(--space-3); text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-subtle); border-radius: 6px; }
.imp-error { padding: var(--space-3); border: 1px solid var(--color-danger); border-radius: 6px; background: var(--surface-danger-subtle, #fee2e2); color: var(--color-danger); }
.imp-card-list { display:grid; gap: 6px; }
.imp-card-row { padding: 6px 10px; background: var(--surface-subtle); border-radius: 4px; font-size: var(--fs-xs); }
.imp-card-id { color: var(--color-primary); font-weight: 600; }

.imp-chain { display: grid; gap: var(--space-2); padding: var(--space-3); background: var(--surface-base); border: 2px solid var(--color-primary); border-radius: 8px; }
.imp-chain h3 { margin: 0 0 var(--space-1); font-size: var(--fs-lg); }
.imp-chain-controls { display:flex; gap:var(--space-2); align-items:center; flex-wrap: wrap; }
.imp-chain-step { display:flex; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 4px; background: var(--surface-subtle); font-size: var(--fs-sm); }
.imp-chain-step--running { background: var(--surface-elevated); border-left: 3px solid var(--color-primary); }
.imp-chain-step--succeeded { background: var(--surface-subtle); border-left: 3px solid #22c55e; }
.imp-chain-step--failed { background: var(--surface-subtle); border-left: 3px solid var(--color-danger); }
.imp-chain-step--pending { opacity: 0.6; }
.imp-chain-step--skipped { opacity: 0.5; text-decoration: line-through; }
.imp-chain-icon { width: 18px; text-align: center; }
.imp-chain-error { color: var(--color-danger); font-size: var(--fs-xs); }

.imp-next-step {
  display: grid; gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--surface-elevated);
}
.imp-next-step h3 { margin: 0; font-size: var(--fs-lg); color: var(--color-primary); }
.imp-next-step__hint { font-size: var(--fs-sm); color: var(--text-secondary); }
.imp-next-step__action {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: 6px;
  font-size: var(--fs-sm);
}
.imp-next-step__nav-link {
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 4px 10px;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: var(--fs-xs);
}
.imp-next-step__nav-link:hover { background: var(--surface-sunken); }

.imp-intro {
  padding: var(--space-3) var(--space-4);
  background: var(--surface-subtle);
  border-radius: 8px;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border-left: 4px solid var(--color-primary);
}
.imp-intro h3 { margin: 0 0 6px; font-size: var(--fs-md); color: var(--text-primary); }
.imp-intro ol { margin: 4px 0 0; padding-left: 20px; }
.imp-intro li { margin-bottom: 2px; }
.imp-intro__goal { color: var(--text-primary); font-weight: 600; }

.imp-section h3 .imp-section-sub-num { color: var(--color-primary); font-weight: 700; margin-right: 6px; }
.imp-section h3 .imp-section-techname { color: var(--text-secondary); font-weight: 400; font-size: var(--fs-sm); margin-left: 8px; }

details.imp-collapsible { background: var(--surface-base); border:1px solid var(--border-default); border-radius: 8px; padding: 0; }
details.imp-collapsible > summary {
  cursor: pointer;
  padding: var(--space-3);
  font-size: var(--fs-md);
  font-weight: 600;
  list-style: none;
  display: flex; align-items: center; gap: 8px;
}
details.imp-collapsible > summary::-webkit-details-marker { display: none; }
details.imp-collapsible > summary::before { content: "▶"; font-size: 10px; color: var(--text-secondary); transition: transform 0.15s; }
details.imp-collapsible[open] > summary::before { transform: rotate(90deg); }
details.imp-collapsible[open] > summary { border-bottom: 1px solid var(--border-subtle); }
details.imp-collapsible > summary .imp-collapsible-hint { font-weight: 400; font-size: var(--fs-xs); color: var(--text-secondary); margin-left: auto; }
details.imp-collapsible__body { padding: var(--space-3); display: grid; gap: var(--space-2); }
`;

function ensureStyles(): void {
  if (document.getElementById("imp-styles")) return;
  const style = document.createElement("style");
  style.id = "imp-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderAuditSummary(data: ImprovementsResponse): string {
  const parts: string[] = [];
  if (data.audit_summary) {
    const a = data.audit_summary;
    const hasFindings = a.findings_top10.length > 0;
    parts.push(`
      <div class="imp-section">
        <h3><span class="imp-section-sub-num">①</span>機械検査の結果<span class="imp-section-techname">L11 audit</span></h3>
        <p class="imp-section-sub">storyboard.json をルールベースで検査し、形式エラーや要修正点を検出した結果</p>
        <dl class="imp-stat-row">
          <div><dt>ページ数</dt><dd>${a.pages_total}</dd></div>
          <div><dt>検出件数</dt><dd>${a.findings_total}</dd></div>
          <div><dt>error</dt><dd>${a.counts_by_severity.error ?? 0}</dd></div>
          <div><dt>warn</dt><dd>${a.counts_by_severity.warn ?? 0}</dd></div>
          <div><dt>info</dt><dd>${a.counts_by_severity.info ?? 0}</dd></div>
        </dl>
        ${!hasFindings ? '<div class="imp-empty">✅ 検出件数 0 件 (機械検査は通過)</div>' : `
          <details class="imp-collapsible" ${a.findings_total > 5 ? "" : "open"}>
            <summary>検出された findings (top 10)<span class="imp-collapsible-hint">クリックで展開</span></summary>
            <div class="imp-collapsible__body">
              ${a.findings_top10.map((f) => `
                <div class="imp-finding imp-finding--${f.severity}">
                  <div><strong>${escapeHtml(f.rule)}</strong> @ page ${f.page_no}${f.panel_no ? ` panel#${f.panel_no}` : ""}</div>
                  <div class="imp-finding-meta">${escapeHtml(f.message)}</div>
                </div>
              `).join("")}
            </div>
          </details>
        `}
      </div>
    `);
  }
  if (data.name_audit_summary && data.name_audit_summary.new_rules_findings.length > 0) {
    // 新ルール検出が 0 件なら details で見せない (初見ノイズになる)。検出があるときだけ展開可能で出す。
    const n = data.name_audit_summary;
    parts.push(`
      <details class="imp-collapsible">
        <summary>📋 上級向け: Phase X 新ルール検出 (${n.new_rules_findings.length} 件)<span class="imp-collapsible-hint">narration / recovery / expectation gap など</span></summary>
        <div class="imp-collapsible__body">
          <p class="imp-section-sub">narration_dominant / recovery_beat_missing / expectation_reality_gap_absent / mascot_temperature_pair_missing / face_only_emotion_run の 5 ルール</p>
          ${n.new_rules_findings.map((f) => `
            <div class="imp-finding imp-finding--${f.severity}">
              <div><strong>${escapeHtml(f.rule)}</strong> @ page ${f.page_no}${f.panel_no ? ` panel#${f.panel_no}` : ""}</div>
              <div class="imp-finding-meta">${escapeHtml(f.message)}</div>
            </div>
          `).join("")}
        </div>
      </details>
    `);
  }
  return parts.join("");
}

function renderProposalSection(
  title: string,
  description: string,
  proposals: ImprovementsResponse["opening_hook_proposals"] | ImprovementsResponse["cliffhanger_proposals"],
  pullLink?: ImprovementsResponse["cliffhanger_proposals"]["pull_link"],
  techname?: string,
): string {
  const lines: string[] = [];
  lines.push(`
    <div class="imp-section">
      <h3>${escapeHtml(title)}${techname ? `<span class="imp-section-techname">${escapeHtml(techname)}</span>` : ""}</h3>
      <p class="imp-section-sub">${escapeHtml(description)}</p>
  `);
  if (!proposals.available) {
    lines.push(`<div class="imp-empty">未生成。下の「次のアクション」から生成ジョブを起動してください</div>`);
  } else {
    lines.push(`
      <dl class="imp-stat-row">
        <div><dt>提案数</dt><dd>${proposals.proposals_count}</dd></div>
        <div><dt>最新ファイル</dt><dd><code>${escapeHtml(proposals.latest_file ?? "")}</code></dd></div>
      </dl>
      <div>
        <strong>候補パターン:</strong>
        <div class="imp-pattern-list">
          ${(proposals.candidate_patterns ?? []).map((p) => {
            const isRec = p === proposals.recommendation?.pattern_id;
            return `<span class="imp-pattern-tag ${isRec ? "imp-pattern-tag--recommended" : ""}">${escapeHtml(p)}${isRec ? " ★推奨" : ""}</span>`;
          }).join("")}
        </div>
      </div>
      ${proposals.recommendation ? `
        <div>
          <strong>推奨理由:</strong>
          <span class="imp-info">${escapeHtml(proposals.recommendation.rationale)}</span>
        </div>
      ` : ""}
    `);
    if (pullLink) {
      lines.push(`
        <div class="imp-pull-link">
          <strong>pull_link:</strong> ${escapeHtml(pullLink.current_episode_cliff)}
          ${pullLink.is_volume_end ? "<em>(巻末)</em>" : ""}
          <br>
          <strong>次話 opening_hook 予告:</strong> ${escapeHtml(pullLink.next_opening_hook_hint)}
        </div>
      `);
    }
  }
  lines.push(`</div>`);
  return lines.join("");
}

function renderCompletionRisk(data: ImprovementsResponse): string {
  const r = data.completion_risk;
  if (!r) return "";
  const levelClass = r.level === "high" ? "danger" : r.level === "medium" ? "warning" : "info";
  const levelLabel = r.level === "high" ? "高リスク" : r.level === "medium" ? "中リスク" : "低リスク";
  return `
    <div class="imp-section">
      <h3><span class="imp-section-sub-num">④</span>KU 完読率リスク (推定)<span class="imp-section-techname">v0 ヒューリスティック</span></h3>
      <p class="imp-section-sub">audit findings + engagement_audit + 編集判断カード適用数 から自動算出。実 KENP データ取得後 (Phase Z) で v1 学習予定</p>
      <div class="imp-finding imp-finding--${levelClass}">
        <strong>${escapeHtml(levelLabel)}</strong> (penalty: ${r.total_penalty})
        <div class="imp-finding-meta">${escapeHtml(r.summary)}</div>
      </div>
      ${r.top_factors.length > 0 ? `
        <div class="imp-card-list">
          <strong>主要因子 (penalty 順):</strong>
          ${r.top_factors.map((f) => `
            <div class="imp-card-row">
              <span class="${f.penalty < 0 ? "imp-info" : "imp-finding-meta"}">[${f.penalty > 0 ? "+" : ""}${f.penalty}]</span>
              <strong>${escapeHtml(f.name)}</strong>
              <br>
              <span class="imp-info">観測: ${escapeHtml(f.observed)}</span>
              ${f.hint ? `<br><span class="imp-info">→ ${escapeHtml(f.hint)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${r.recommended_actions.length > 0 ? `
        <div class="imp-pull-link">
          <strong>推奨アクション:</strong>
          <ul>
            ${r.recommended_actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>
  `;
}

function renderIntro(): string {
  return `
    <div class="imp-intro">
      <h3>このページについて</h3>
      <div><span class="imp-intro__goal">目的:</span> 漫画の冒頭3ページ (Hook = 掴み) と最終ページ (Cliff = 引き) を改善し、KU 読者が離脱せずに次話へ進む流れを作る</div>
      <div style="margin-top: 6px;"><span class="imp-intro__goal">使い方:</span></div>
      <ol>
        <li>下の <strong>「次の一手」</strong>パネルが現在地に応じた 1 アクションを提示。基本これに従う</li>
        <li>「品質改善チェーン実行」 1 ボタンで「audit → Hook 適用 → Cliff 適用 → 再 audit」を一気通貫</li>
        <li>細かく走らせたいときだけ最下段の「個別実行」を開く (上級者向け)</li>
        <li>用語: <strong>Hook</strong>=最初の3p で読者の興味を掴む、<strong>Cliff</strong>=末尾で次話を読みたくさせる、<strong>EC</strong>=編集判断カード (修正の処方箋)</li>
      </ol>
    </div>
  `;
}

/**
 * 「次に何をすべきか」を data から推定して 1 panel で示す。
 * 「次のアクション」が並列のメニューであるのに対し、こちらは「現在地→次の一手」を 1 つに絞り込む。
 */
function deriveNextStep(data: ImprovementsResponse): {
  title: string;
  hint: string;
  primary?: { label: string; layer?: string; flags?: Record<string, string | true>; action: "run" | "chain" | "nav-pipeline" | "nav-layers" | "open-edit-modal"; nav?: string };
  secondary?: Array<{ label: string; nav: string }>;
} {
  const errs = data.audit_summary?.counts_by_severity?.error ?? 0;
  const warns = data.audit_summary?.counts_by_severity?.warn ?? 0;
  const hasOpening = data.opening_hook_proposals.available;
  const hasCliff = data.cliffhanger_proposals.available;
  const hasEngagement = data.engagement_audit.available;
  const ecCount = data.engagement_ec_suggestions?.length ?? 0;
  const completionLevel = data.completion_risk?.level;

  // Step 1: audit error が出ているなら最優先で解消
  if (errs > 0) {
    return {
      title: "❌ まず L11 audit の error を解消",
      hint: `audit findings に error が ${errs} 件残っています。下の「audit findings」一覧を見て、AI 編集で個別修正するか、再度 L04_1/L04_9 で生成しなおしてください。`,
      primary: { label: "AI 編集を開く", action: "open-edit-modal" },
    };
  }

  // Step 2: 提案が片方でも未生成なら生成
  if (!hasOpening && !hasCliff) {
    return {
      title: "▶ Hook / Cliff 提案を生成",
      hint: "Opening Hook と Cliffhanger の提案がまだありません。下の「次のアクション」から両方の『提案を生成 (3案)』を実行してください (各 2-3分)。",
      primary: {
        label: "🚀 チェーンを実行 (生成→適用→再audit を一気通貫)",
        action: "chain",
      },
    };
  }
  if (!hasOpening) {
    return {
      title: "▶ Opening Hook 提案を生成",
      hint: "Cliffhanger は揃っていますが、Opening Hook の提案がまだありません。",
      primary: { label: "Opening Hook 提案を生成 (3案)", action: "run", layer: "L04_1", flags: { "--max-proposals": "3" } },
    };
  }
  if (!hasCliff) {
    return {
      title: "▶ Cliffhanger 提案を生成",
      hint: "Opening Hook は揃っていますが、Cliffhanger の提案がまだありません。",
      primary: { label: "Cliffhanger 提案を生成 (3案)", action: "run", layer: "L04_9", flags: { "--max-proposals": "3" } },
    };
  }

  // Step 3: 提案ある → Engagement Audit でリスク評価がまだなら走らせる
  if (!hasEngagement) {
    return {
      title: "🔍 Engagement Audit (LLM) で読者離脱リスクを採点",
      hint: "提案は揃いました。次は claude opus に全 22 page を採点させ、p4-7 みたいな『沈み』を検出します (12-20 分)。",
      primary: { label: "Engagement Audit を実行 (LLM)", action: "run", layer: "L05_5", flags: {} },
    };
  }

  // Step 4: Engagement の結果に応じた誘導
  if (data.engagement_audit.human_review_required) {
    return {
      title: "⚠️ Engagement Audit が要レビュー",
      hint: `LLM が「人間レビュー要」と判定しました${ecCount > 0 ? `。EC suggestion ${ecCount} 件が下に並んでいるので、該当する EC を「AI 編集に流す」で適用` : ""}。または下の「チェーンを実行」で推奨案を一気通貫適用するのも有効。`,
      primary: ecCount > 0
        ? { label: "EC suggestion を確認", action: "nav-layers", nav: "improvements" }
        : { label: "チェーンを実行 (適用→再audit)", action: "chain" },
    };
  }

  // Step 5: 完了状態 → 次の layer へ
  if (completionLevel === "low") {
    return {
      title: "✅ 品質改善は十分。次の layer へ",
      hint: `audit error 0 / Engagement レビュー不要 / KU 完読率リスク=低。これで Hook/Cliff の改善は完了。次は「パイプライン進捗」で L05.5 (engagement) 以降の layer を進めてください${warns > 0 ? ` (warn ${warns} 件は無視可能ですが気になれば AI 編集で潰す)` : ""}。`,
      primary: { label: "パイプライン進捗 view へ", action: "nav-pipeline" },
      secondary: [
        { label: "L11 audit を手動再実行", nav: "layers" },
        { label: "ネーム原案 (storyboard) を確認", nav: "storyboard" },
      ],
    };
  }

  return {
    title: "🔧 推奨案の適用が未完了",
    hint: "提案は揃っているが、まだ storyboard.json に書き込まれていない or 完読率リスクが残っています。下の「Hook 推奨適用」「Cliff 推奨適用」を順に押すか、「チェーンを実行」で audit→適用→再audit を一気通貫してください。",
    primary: { label: "🚀 チェーンを実行", action: "chain" },
  };
}

function renderNextStep(data: ImprovementsResponse, state: ViewState): string {
  const next = deriveNextStep(data);
  const primary = next.primary;
  const buttonAttrs = (() => {
    if (!primary) return "";
    if (primary.action === "chain") {
      return `data-action="chain-start" ${state.chainRunning ? "disabled" : ""}`;
    }
    if (primary.action === "run" && primary.layer) {
      return `data-action="run" data-label="${escapeHtml(primary.label)}" data-job-layer="${escapeHtml(primary.layer)}" data-job-flags='${escapeHtml(JSON.stringify(primary.flags ?? {}))}'`;
    }
    if (primary.action === "nav-pipeline") {
      return `data-action="nav-view" data-view="pipeline"`;
    }
    if (primary.action === "nav-layers") {
      return `data-action="nav-view" data-view="${escapeHtml(primary.nav ?? "layers")}"`;
    }
    if (primary.action === "open-edit-modal") {
      return `data-action="open-ai-edit"`;
    }
    return "";
  })();

  return `
    <div class="imp-next-step">
      <h3>${escapeHtml(next.title)}</h3>
      <div class="imp-next-step__hint">${escapeHtml(next.hint)}</div>
      ${primary ? `
        <div class="imp-next-step__action">
          <button type="button" class="nc-button nc-button--primary" ${buttonAttrs}>${escapeHtml(primary.label)}</button>
        </div>
      ` : ""}
      ${next.secondary && next.secondary.length > 0 ? `
        <div class="imp-next-step__action">
          <span class="imp-info">他の選択肢:</span>
          ${next.secondary.map((s) => `<button type="button" class="imp-next-step__nav-link" data-action="nav-view" data-view="${escapeHtml(s.nav)}">${escapeHtml(s.label)}</button>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function chainStepIcon(status: ChainStepStatus): string {
  if (status === "running") return "⏳";
  if (status === "succeeded") return "✅";
  if (status === "failed") return "❌";
  if (status === "skipped") return "—";
  return "○";
}

function renderChain(state: ViewState): string {
  const hasOpening = state.data?.opening_hook_proposals.recommendation;
  const hasCliff = state.data?.cliffhanger_proposals.recommendation;
  const canChain = !!hasOpening || !!hasCliff;
  const reason = !canChain ? "提案 (Opening Hook / Cliffhanger) が未生成です。先に L04_1 / L04_9 を実行してください" : "";

  return `
    <div class="imp-chain">
      <h3>🚀 品質改善チェーン実行 (おすすめ)</h3>
      <p class="imp-section-sub">「機械検査 → Hook 推奨適用 → Cliff 推奨適用 → 再検査」を 1 ボタンで一気通貫実行。既に提案 (②③) が揃っている場合の最短ルート</p>
      <div class="imp-chain-controls">
        <button type="button" class="nc-button nc-button--primary" data-action="chain-start" ${(!canChain || state.chainRunning) ? "disabled" : ""}>
          ${state.chainRunning ? "実行中…" : "チェーンを実行"}
        </button>
        ${state.chainSteps && !state.chainRunning ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-action="chain-clear">進捗をクリア</button>` : ""}
        ${reason ? `<span class="imp-info">${escapeHtml(reason)}</span>` : ""}
      </div>
      ${state.chainSteps ? `
        <div>
          ${state.chainSteps.map((step) => `
            <div class="imp-chain-step imp-chain-step--${step.status}">
              <span class="imp-chain-icon">${chainStepIcon(step.status)}</span>
              <strong>${escapeHtml(step.label)}</strong>
              <code class="imp-info">${escapeHtml(step.layer)}</code>
              ${step.jobId ? `<span class="imp-info">job=${escapeHtml(step.jobId.slice(0, 8))}</span>` : ""}
              ${step.error ? `<span class="imp-chain-error">${escapeHtml(step.error)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderEngagementEcSuggestions(data: ImprovementsResponse): string {
  if (!data.engagement_ec_suggestions || data.engagement_ec_suggestions.length === 0) return "";
  return `
    <div class="imp-section">
      <h3><span class="imp-section-sub-num">⑥</span>EC (編集判断カード) 適用候補<span class="imp-section-techname">自動抽出</span></h3>
      <p class="imp-section-sub">⑤ の LLM が「これを直そう」と言及したカード。専用 layer がある EC は <strong>L04_1 / L04_9 を直接実行 (推奨)</strong>、汎用編集は AI 編集 (Codex) フォールバック</p>
      ${data.engagement_ec_suggestions.map((s) => {
        const rec = s.recommended_layer;
        const primaryButton = rec
          ? `<button type="button" class="nc-button nc-button--primary nc-button--sm" data-action="apply-ec-layer" data-card-id="${escapeHtml(s.card_id)}" title="${escapeHtml(rec.note)}">${escapeHtml(rec.label)}</button>`
          : `<button type="button" class="nc-button nc-button--primary nc-button--sm" data-action="apply-ec" data-card-id="${escapeHtml(s.card_id)}">AI 編集に流す (Codex)</button>`;
        const fallbackButton = rec
          ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-action="apply-ec" data-card-id="${escapeHtml(s.card_id)}" title="Codex CLI で自由編集 (時間がかかる場合あり)">AI 編集 (副)</button>`
          : "";
        return `
          <div class="imp-action-row">
            ${primaryButton}
            ${fallbackButton}
            <strong>${escapeHtml(s.card_id)}</strong> ${escapeHtml(s.title)}
            ${s.applies_to_pages.length > 0 ? `<span class="imp-info">(対象 page: ${s.applies_to_pages.join(", ")})</span>` : `<span class="imp-info">(全体)</span>`}
            <span class="imp-action-desc">「${escapeHtml(s.source_text)}」</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderEngagementAudit(data: ImprovementsResponse): string {
  const e = data.engagement_audit;
  if (!e.available) {
    return `
      <div class="imp-section">
        <h3><span class="imp-section-sub-num">⑤</span>読者離脱リスク (LLM 判定)<span class="imp-section-techname">L5.5 Engagement Audit</span></h3>
        <p class="imp-section-sub">storyboard を claude opus で「読者離脱リスク」採点。下の next_actions から実行</p>
        <div class="imp-empty">未生成。「Engagement Audit を実行 (LLM)」ボタンから起動してください (12-20分)</div>
      </div>
    `;
  }
  const riskLevel = (e.overall_drop_off_risk ?? 0) >= 60 ? "danger" : (e.overall_drop_off_risk ?? 0) >= 30 ? "warning" : "info";
  return `
    <div class="imp-section">
      <h3>L5.5 Engagement Audit (LLM 判定)</h3>
      <p class="imp-section-sub">claude opus による「読者離脱リスク」採点。生成: ${escapeHtml(e.generated_at ?? "")}</p>
      <dl class="imp-stat-row">
        <div><dt>overall_drop_off_risk</dt><dd>${(e.overall_drop_off_risk ?? 0).toFixed(1)} / 100</dd></div>
        <div><dt>boring pages</dt><dd>${(e.boring_pages ?? []).length}件 [${(e.boring_pages ?? []).join(", ")}]</dd></div>
        <div><dt>human_review_required</dt><dd>${e.human_review_required ? "✅ 要レビュー" : "—"}</dd></div>
      </dl>
      ${e.worst_page ? `
        <div class="imp-finding imp-finding--${riskLevel}">
          <strong>worst_page: page ${e.worst_page.page_no}</strong> (risk ${e.worst_page.drop_off_risk})
          <div class="imp-finding-meta">${escapeHtml(e.worst_page.reason)}</div>
        </div>
      ` : ""}
      ${e.rationale_summary ? `
        <div class="imp-pull-link">
          <strong>所感:</strong> ${escapeHtml(e.rationale_summary)}
        </div>
      ` : ""}
    </div>
  `;
}

function renderRelatedCards(data: ImprovementsResponse): string {
  // 初見にとって 11 枚のカード一覧はノイズ。⑥の自動抽出で必要なものは出るので、
  // 全カタログは details で折り畳んで「参考資料」扱いにする。
  return `
    <details class="imp-collapsible">
      <summary>📚 参考: 編集判断カード (EC) カタログ全 ${data.related_cards.length} 枚<span class="imp-collapsible-hint">findings に対応する修正パターン辞書</span></summary>
      <div class="imp-collapsible__body">
        <p class="imp-section-sub">audit findings や engagement_audit で問題が出たときに自動 / 手動で適用される修正パターンの蓄積。⑥ で必要なものは自動抽出されているので、初見はここを開く必要はありません</p>
        ${data.related_cards.length === 0 ? '<div class="imp-empty">カードなし</div>' : `
          <div class="imp-card-list">
            ${data.related_cards.map((c) => `
              <div class="imp-card-row">
                <span class="imp-card-id">${escapeHtml(c.card_id)}</span> ${escapeHtml(c.title)}
                <span class="imp-info"> (scope=${escapeHtml(c.scope)}${c.trigger.flag ? `, trigger=${escapeHtml(c.trigger.flag)}` : ""})</span>
                <br>
                <span class="imp-info">${escapeHtml(c.diagnosis)}</span>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    </details>
  `;
}

function renderNextActions(data: ImprovementsResponse, state: ViewState): string {
  return `
    <details class="imp-collapsible">
      <summary>🛠 上級者向け: 個別実行 (細かく走らせたい場合)<span class="imp-collapsible-hint">${data.next_actions.length} 個のジョブを個別投入</span></summary>
      <div class="imp-collapsible__body">
        <p class="imp-section-sub">通常は上の「🚀 品質改善チェーン実行」で OK。個別に「Opening だけ生成」「Engagement Audit だけ走らせる」等したいときはここから:</p>
        ${data.next_actions.map((a) => {
        const flagsStr = Object.entries(a.job_flags)
          .map(([k, v]) => (v === true ? k : `${k}=${v}`))
          .join(" ");
        const isStarting = state.starting === a.label;
        return `
          <div class="imp-action-row">
            <button type="button" class="nc-button nc-button--primary nc-button--sm" data-action="run" data-label="${escapeHtml(a.label)}" data-job-layer="${escapeHtml(a.job_layer)}" data-job-flags='${escapeHtml(JSON.stringify(a.job_flags))}' ${isStarting ? "disabled" : ""}>
              ${isStarting ? "起動中…" : "実行"}
            </button>
            <strong>${escapeHtml(a.label)}</strong>
            <code class="imp-info">${escapeHtml(a.job_layer)} ${escapeHtml(flagsStr)}</code>
            <span class="imp-action-desc">${escapeHtml(a.description)}</span>
          </div>
        `;
      }).join("")}
      </div>
    </details>
  `;
}

function render(container: HTMLElement, state: ViewState): void {
  const head = `
    <div class="imp-head">
      <h2>品質改善</h2>
      <span class="imp-info">slug: ${escapeHtml(state.slug || "(未選択)")} / ep${String(state.episode).padStart(2, "0")}</span>
      <span class="imp-spacer"></span>
      <button type="button" class="nc-button nc-button--ghost" data-action="reload" ${state.loading ? "disabled" : ""}>
        ${state.loading ? "読込中…" : "再読込"}
      </button>
    </div>
  `;

  const body = state.error
    ? `<div class="imp-error">${escapeHtml(state.error)}</div>`
    : state.data
      ? `
        ${renderIntro()}
        ${renderNextStep(state.data, state)}
        ${renderAuditSummary(state.data)}
        <div class="imp-grid">
          ${renderProposalSection(
            "②冒頭3p (Hook) の提案",
            "最初の 3 ページを掴みパターン辞書 (7種) に従って再生成 — KU 棚で開いた最初の3pの品質向上",
            state.data.opening_hook_proposals,
            undefined,
            "L4.1 Opening Hook",
          )}
          ${renderProposalSection(
            "③末尾ページ (Cliff) の提案",
            "末尾ページを引きパターン辞書 (7種) に従って再設計 + 次話冒頭との接続 — 次話/次巻 read-through 最大化",
            state.data.cliffhanger_proposals,
            state.data.cliffhanger_proposals.pull_link,
            "L4.9 Cliffhanger",
          )}
        </div>
        ${renderCompletionRisk(state.data)}
        ${renderEngagementAudit(state.data)}
        ${renderEngagementEcSuggestions(state.data)}
        ${renderChain(state)}
        ${renderRelatedCards(state.data)}
        ${renderNextActions(state.data, state)}
      `
      : state.loading
        ? `<div class="imp-empty">読込中…</div>`
        : `<div class="imp-empty">slug / episode を作品一覧から選択してください</div>`;

  container.innerHTML = `
    <div class="imp-view">
      ${head}
      ${body}
    </div>
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: Toast["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

async function loadData(state: ViewState, container: HTMLElement): Promise<void> {
  if (!state.slug || !state.episode) {
    state.error = "slug/episode が未設定。作品一覧から選択してください";
    state.data = null;
    render(container, state);
    return;
  }
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const data = await apiGetImprovements(state.slug, state.episode);
    state.data = data;
    state.error = null;
  } catch (e) {
    state.error = errorText(e);
    state.data = null;
  } finally {
    state.loading = false;
    render(container, state);
  }
}

/** ジョブの SSE stream を開いて完了 (succeeded) を待つ。succeeded 以外は reject。 */
function awaitJobCompletion(jobId: string): Promise<{ state: JobState; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const stream = openJobStream(jobId, {
      onEvent: () => {},
      onDone: (info) => {
        if (info.state === "succeeded") {
          resolve(info);
        } else {
          reject(new Error(`job ${jobId} ended with state=${info.state} exit=${info.exitCode ?? "?"}`));
        }
      },
      onError: (err) => {
        // EventSource error の後 SSE は close される。完了通知を取り逃した可能性があるが、
        // ここでは reject して呼び出し側で扱う。
        reject(err);
      },
    });
    // タイムアウト保険 (60 分) — Codex の長時間ジョブを許容するが、永続接続は避ける
    setTimeout(() => {
      stream.close();
      reject(new Error(`job ${jobId} timed out after 60 minutes`));
    }, 60 * 60 * 1000);
  });
}

/** L04_9 の volume_position を next_actions から取得 */
function pickVolumePosition(data: ImprovementsResponse): string {
  const cliffApply = data.next_actions.find((a) => a.job_layer === "L04_9" && a.job_flags["--apply-recommendation"] === true);
  const vp = cliffApply?.job_flags["--volume-position"];
  return typeof vp === "string" ? vp : "mid";
}

async function runChain(state: ViewState, container: HTMLElement): Promise<void> {
  if (!state.data) return;
  const hasOpening = !!state.data.opening_hook_proposals.recommendation;
  const hasCliff = !!state.data.cliffhanger_proposals.recommendation;
  if (!hasOpening && !hasCliff) {
    setToast(state, container, "提案が未生成です。先に L04_1 / L04_9 を実行してください", "warning");
    return;
  }
  const volumePosition = pickVolumePosition(state.data);
  const steps: ChainStep[] = [];
  steps.push({ label: "L11 audit (pre)", layer: "L11", flags: {}, status: "pending" });
  if (hasOpening) {
    steps.push({
      label: "L04_1 Opening Hook 推奨案を直接適用",
      layer: "L04_1",
      flags: { "--max-proposals": "1", "--apply-recommendation": true },
      status: "pending",
    });
  } else {
    steps.push({ label: "L04_1 (skipped — 提案なし)", layer: "L04_1", flags: {}, status: "skipped" });
  }
  if (hasCliff) {
    steps.push({
      label: "L04_9 Cliffhanger 推奨案を直接適用",
      layer: "L04_9",
      flags: { "--max-proposals": "1", "--apply-recommendation": true, "--volume-position": volumePosition },
      status: "pending",
    });
  } else {
    steps.push({ label: "L04_9 (skipped — 提案なし)", layer: "L04_9", flags: {}, status: "skipped" });
  }
  steps.push({ label: "L11 audit (post)", layer: "L11", flags: {}, status: "pending" });

  state.chainSteps = steps;
  state.chainRunning = true;
  render(container, state);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.status === "skipped") continue;
    step.status = "running";
    render(container, state);
    try {
      const argsRecord: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.flags)) argsRecord[k] = v === true ? "" : v;
      const job = await apiPostJob({
        layer: step.layer as Parameters<typeof apiPostJob>[0]["layer"],
        slug: state.slug,
        episode: state.episode,
        args: argsRecord,
      });
      step.jobId = job.job_id;
      render(container, state);
      await awaitJobCompletion(job.job_id);
      step.status = "succeeded";
      render(container, state);
    } catch (e) {
      step.status = "failed";
      step.error = errorText(e);
      state.chainRunning = false;
      render(container, state);
      setToast(state, container, `${step.label} で失敗。チェーンを中断しました`, "danger");
      return;
    }
  }

  state.chainRunning = false;
  setToast(state, container, "チェーン完了。最新状態を再読込しています", "success");
  await loadData(state, container);
}

async function startJob(
  state: ViewState,
  container: HTMLElement,
  label: string,
  layer: string,
  flags: Record<string, string | true>,
): Promise<void> {
  if (!state.slug || !state.episode) return;
  state.starting = label;
  render(container, state);

  try {
    // /api/jobs に投入。args は Record<string, string> 形式
    // boolean フラグ (--apply-recommendation 等) は値を "" として渡す (registry pattern: /^$/)
    const argsRecord: Record<string, string> = {};
    for (const [k, v] of Object.entries(flags)) {
      argsRecord[k] = v === true ? "" : v;
    }
    await apiPostJob({
      layer: layer as Parameters<typeof apiPostJob>[0]["layer"],
      slug: state.slug,
      episode: state.episode,
      args: argsRecord,
    });
    setToast(state, container, `${label} を起動しました。Jobs hub で進捗確認後、再読込してください`, "success");
  } catch (e) {
    setToast(state, container, `${label} の起動に失敗: ${errorText(e)}`, "danger");
  } finally {
    state.starting = null;
    render(container, state);
  }
}

export function mountImprovementsView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const state: ViewState = {
    slug: store.state.currentSlug,
    episode: store.state.currentEpisode,
    data: null,
    loading: false,
    starting: null,
    error: null,
    toast: null,
    chainSteps: null,
    chainRunning: false,
  };

  const unsubscribe = store.subscribe((s) => {
    let dirty = false;
    if (s.currentSlug !== state.slug) {
      state.slug = s.currentSlug;
      dirty = true;
    }
    if (s.currentEpisode !== state.episode) {
      state.episode = s.currentEpisode;
      dirty = true;
    }
    if (dirty) {
      state.data = null;
      state.error = null;
      render(container, state);
    }
  });

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest<HTMLButtonElement>("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "reload") {
        void loadData(state, container);
        return;
      }
      if (action === "run") {
        const label = btn.dataset.label ?? "";
        const layer = btn.dataset.jobLayer ?? "";
        let flags: Record<string, string | true> = {};
        try {
          flags = JSON.parse(btn.dataset.jobFlags ?? "{}");
        } catch {
          // ignore
        }
        if (!layer || !label) return;
        void startJob(state, container, label, layer, flags);
      }
      if (action === "nav-view") {
        const view = btn.dataset.view;
        if (view) {
          // store の ViewName 型に合致するもののみ受理。安全側で許容リスト方式。
          const allowed = ["pipeline", "layers", "improvements", "storyboard", "quality"];
          if (allowed.includes(view)) {
            store.update({ currentView: view as Parameters<typeof store.update>[0]["currentView"] });
          }
        }
        return;
      }
      if (action === "open-ai-edit") {
        void openAiEditModal({ scope: state.slug || "_console", originView: "improvements" });
        return;
      }
      if (action === "chain-start") {
        if (state.chainRunning) return;
        void runChain(state, container);
        return;
      }
      if (action === "chain-clear") {
        if (state.chainRunning) return;
        state.chainSteps = null;
        render(container, state);
        return;
      }
      if (action === "apply-ec-layer") {
        // Phase Y WY-14: 専用 layer (L04_1/L04_9 等) で適用 — 安定で高速
        const cardId = btn.dataset.cardId ?? "";
        if (!cardId || !state.data) return;
        const suggestion = state.data.engagement_ec_suggestions.find((s) => s.card_id === cardId);
        if (!suggestion || !suggestion.recommended_layer) return;
        const rec = suggestion.recommended_layer;
        void startJob(state, container, `${cardId} → ${rec.label}`, rec.layer, rec.flags);
        return;
      }
      if (action === "apply-ec") {
        const cardId = btn.dataset.cardId ?? "";
        if (!cardId || !state.data) return;
        const suggestion = state.data.engagement_ec_suggestions.find((s) => s.card_id === cardId);
        if (!suggestion) return;
        // ai-edit view へ preset 送り。原則: scope = current slug, target は EC scope に応じて決める。
        const pageRangeText = suggestion.applies_to_pages.length > 0
          ? `対象 page: ${suggestion.applies_to_pages.join(", ")}`
          : "対象 page: (全体スコープ — LLM の所見に基づき適切な page を判断)";
        const prompt = [
          `編集判断カード ${suggestion.card_id} (${suggestion.title}) を適用してください。`,
          ``,
          `■ instruction:`,
          suggestion.instruction || "(instruction 未登録 — diagnosis を参照)",
          ``,
          `■ ${pageRangeText}`,
          ``,
          `■ Engagement Audit の所見 (このカードを suggest した根拠):`,
          `「${suggestion.source_text}」`,
          ``,
          `■ 編集対象ファイル:`,
          `data/manga/works/${state.slug}/episodes/ep${String(state.episode).padStart(2, "0")}/storyboard.json`,
          ``,
          `編集後は L11 audit を再実行して findings 解消を確認してください。`,
        ].join("\n");
        void openAiEditModal({
          scope: state.slug,
          initialTarget: `episodes/ep${String(state.episode).padStart(2, "0")}/storyboard.json`,
          initialPrompt: prompt,
          originLayer: "L99",
          originView: "improvements",
        });
      }
    },
    { signal: controller.signal },
  );

  if (state.slug && state.episode) {
    void loadData(state, container);
  } else {
    render(container, state);
  }

  return () => {
    controller.abort();
    unsubscribe();
    container.innerHTML = "";
  };
}
