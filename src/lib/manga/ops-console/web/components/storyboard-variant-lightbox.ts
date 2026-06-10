import type {
  StoryboardProposal,
  StoryboardProposalsIndex,
} from "../../../storyboard-v2/storyboard-alts";
import type {
  StoryboardAuditReport,
  StoryboardAuditVariant,
} from "../../../qa-v2/storyboard-audit";
import type { AdoptedStoryboard } from "../../../revision-ui/types";
import { apiPostAdoptedStoryboard } from "../lib/api";
import { spawnLayerWithModal } from "../lib/layer-actions";

export type StoryboardVariantLightboxConfig = {
  slug: string;
  episode: number;
  proposals: StoryboardProposal[];
  audit: StoryboardAuditReport | null;
  adopted: AdoptedStoryboard;
  variantSvgs: Record<string, string[]>;
  initialProposalId?: string;
};

export type StoryboardVariantLightboxResult =
  | { status: "adopted"; proposalId: string }
  | { status: "regen-spawned" }
  | { status: "audit-spawned" }
  | { status: "cancelled" };

const LIGHTBOX_CSS = `
.sb-lightbox {
  width: min(1180px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto auto;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
}
.sb-lightbox__head,
.sb-lightbox__nav,
.sb-lightbox__stage,
.sb-lightbox__audit-header,
.sb-lightbox__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sb-lightbox__head { border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px; }
.sb-lightbox__title { margin: 0; font-size: 18px; letter-spacing: 0; }
.sb-lightbox__counter { color: var(--text-secondary); font-size: var(--fs-sm); font-weight: 700; }
.sb-lightbox__close { margin-left: auto; }
.sb-lightbox__nav { justify-content: space-between; color: var(--text-secondary); font-size: var(--fs-sm); }
.sb-lightbox__variant-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.sb-lightbox__stage {
  min-height: 320px;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: #f8fafc;
}
.sb-lightbox__svg {
  display: block;
  width: min(800px, 100%);
  max-width: 800px;
  max-height: min(62vh, 760px);
  object-fit: contain;
  background: #fff;
  border: 1px solid #e5e7eb;
}
.sb-lightbox__page-count {
  min-width: 64px;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-align: center;
}
.sb-lightbox__audit {
  max-height: 180px;
  overflow: auto;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-elevated);
  font-size: var(--fs-sm);
}
.sb-lightbox__audit--missing { color: var(--text-secondary); }
.sb-lightbox__issues { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.sb-lightbox__issue { line-height: 1.5; }
.sb-lightbox__cross-notes { color: var(--text-secondary); }
.sb-lightbox__thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 6px;
}
.sb-lightbox__thumb {
  flex: 0 0 132px;
  display: grid;
  grid-template-rows: 108px auto;
  gap: 6px;
  min-height: 150px;
  padding: 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: #fff;
  color: var(--text-primary);
  cursor: pointer;
}
.sb-lightbox__thumb.is-active { border: 2px solid var(--color-primary); padding: 6px; }
.sb-lightbox__thumb.is-adopted { background: #ecfdf5; }
.sb-lightbox__thumb img {
  width: 100%;
  height: 108px;
  object-fit: contain;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}
.sb-lightbox__thumb span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.sb-lightbox__actions { justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 10px; }
.nc-badge--sb-ok { background: #d1fae5; color: #065f46; }
.nc-badge--sb-minor { background: #fef3c7; color: #92400e; }
.nc-badge--sb-major { background: #ffedd5; color: #9a3412; }
.nc-badge--sb-critical { background: #fee2e2; color: #991b1b; }
`;

function ensureStyles(): void {
  if (document.getElementById("sb-lightbox-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-lightbox-styles";
  style.textContent = LIGHTBOX_CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(index: number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.max(0, Math.min(index, maxExclusive - 1));
}

function severityClass(variant: StoryboardAuditVariant | null): string {
  return `nc-badge--sb-${variant?.severity ?? "ok"}`;
}

function svgPath(path: string | undefined): string {
  if (!path) return "";
  return path.startsWith("/") ? path : path;
}

function currentAudit(
  audit: StoryboardAuditReport | null,
  proposalId: string
): StoryboardAuditVariant | null {
  return audit?.proposals.find((variant) => variant.proposal_id === proposalId) ?? null;
}

function renderAuditPanel(audit: StoryboardAuditReport | null, variant: StoryboardAuditVariant | null): string {
  if (!audit || !variant) {
    return `<div class="sb-lightbox__audit sb-lightbox__audit--missing">
      検査未実行。「再検査」ボタンから L04_audit を起動してください。
    </div>`;
  }
  const issues = variant.issues
    .map((issue) => {
      const page = typeof issue.page_no === "number" ? `<span>P${issue.page_no}</span>` : "";
      return `<li class="sb-lightbox__issue">
        <span class="nc-badge">${escapeHtml(issue.category)}</span>
        ${page}
        ${escapeHtml(issue.description)}
      </li>`;
    })
    .join("");
  return `<div class="sb-lightbox__audit">
    <div class="sb-lightbox__audit-header">
      <span class="nc-badge ${severityClass(variant)}">${escapeHtml(variant.severity)}</span>
      <span>${escapeHtml(variant.strengths)}</span>
    </div>
    <ul class="sb-lightbox__issues">${issues || "<li>issue なし</li>"}</ul>
    <div>修正案: ${escapeHtml(variant.suggested_fix)}</div>
    <div class="sb-lightbox__cross-notes">${escapeHtml(audit.cross_variant_notes)}</div>
  </div>`;
}

export function openStoryboardVariantLightbox(
  config: StoryboardVariantLightboxConfig
): Promise<StoryboardVariantLightboxResult> {
  ensureStyles();

  return new Promise((resolve) => {
    let currentIndex = clamp(
      config.initialProposalId
        ? config.proposals.findIndex((proposal) => proposal.proposal_id === config.initialProposalId)
        : 0,
      config.proposals.length
    );
    if (currentIndex < 0) currentIndex = 0;
    let currentPageIndex = 0;
    let settled = false;

    const root = document.createElement("div");
    document.body.appendChild(root);

    const cleanup = (result: StoryboardVariantLightboxResult): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown, { capture: true });
      root.remove();
      resolve(result);
    };

    const setCurrentVariant = (index: number): void => {
      currentIndex = clamp(index, config.proposals.length);
      currentPageIndex = 0;
      render();
    };

    const setCurrentPage = (index: number): void => {
      const proposal = config.proposals[currentIndex];
      const svgs = proposal ? config.variantSvgs[proposal.proposal_id] ?? [] : [];
      currentPageIndex = clamp(index, svgs.length);
      render();
    };

    const adoptCurrent = async (): Promise<void> => {
      const proposal = config.proposals[currentIndex];
      if (!proposal) return;
      await apiPostAdoptedStoryboard(config.slug, config.episode, {
        chosen_proposal_id: proposal.proposal_id,
      });
      cleanup({ status: "adopted", proposalId: proposal.proposal_id });
    };

    const regen = async (): Promise<void> => {
      await spawnLayerWithModal({
        layer: "L04",
        slug: config.slug,
        episode: config.episode,
        extraArgs: { "--variants": "3", "--profile": "balanced" },
      });
      cleanup({ status: "regen-spawned" });
    };

    const audit = async (): Promise<void> => {
      await spawnLayerWithModal({
        layer: "L04_audit",
        slug: config.slug,
        episode: config.episode,
      });
      cleanup({ status: "audit-spawned" });
    };

    function onKeydown(event: KeyboardEvent): void {
      if (settled) return;
      const key = event.key;
      let handled = true;
      if (key === "Escape") {
        cleanup({ status: "cancelled" });
      } else if (key === "ArrowLeft") {
        setCurrentVariant(currentIndex - 1);
      } else if (key === "ArrowRight") {
        setCurrentVariant(currentIndex + 1);
      } else if (key === "PageUp") {
        setCurrentPage(currentPageIndex - 1);
      } else if (key === "PageDown") {
        setCurrentPage(currentPageIndex + 1);
      } else if (key === "a" || key === "A") {
        void adoptCurrent();
      } else if (key === "g" || key === "G") {
        void regen();
      } else if (key === "u" || key === "U") {
        void audit();
      } else {
        handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    const render = (): void => {
      const proposal = config.proposals[currentIndex];
      const proposalId = proposal?.proposal_id ?? "";
      const svgs = proposal ? config.variantSvgs[proposalId] ?? [] : [];
      currentPageIndex = clamp(currentPageIndex, svgs.length);
      const auditVariant = currentAudit(config.audit, proposalId);
      const isAdopted = config.adopted.chosen_proposal_id === proposalId;
      const currentSvg = svgPath(svgs[currentPageIndex]);
      const totalPages = svgs.length;
      const thumbs = config.proposals
        .map((thumbProposal, index) => {
          const firstSvg = svgPath(config.variantSvgs[thumbProposal.proposal_id]?.[0]);
          const active = index === currentIndex ? " is-active" : "";
          const adopted = config.adopted.chosen_proposal_id === thumbProposal.proposal_id ? " is-adopted" : "";
          const star = adopted ? "<span>★</span>" : "";
          return `<button type="button" class="sb-lightbox__thumb${active}${adopted}" data-sb-action="select-variant" data-sb-proposal-id="${escapeHtml(thumbProposal.proposal_id)}">
            ${firstSvg ? `<img src="${escapeHtml(firstSvg)}" alt="${escapeHtml(thumbProposal.proposal_id)} thumbnail">` : "<span>preview なし</span>"}
            <span>${escapeHtml(thumbProposal.proposal_id)} ${star}</span>
          </button>`;
        })
        .join("");

      root.innerHTML = `<div class="nc-modal is-open" data-sb-lightbox-overlay>
  <div class="nc-modal__card nc-modal__card--lg sb-lightbox" role="dialog" aria-modal="true" aria-label="ネーム案を比較">
    <div class="sb-lightbox__head">
      <h2 class="sb-lightbox__title">ネーム案を比較</h2>
      <span class="sb-lightbox__counter">${currentIndex + 1} / ${config.proposals.length}</span>
      ${isAdopted ? '<span class="nc-badge nc-badge--success">★ 採用中</span>' : ""}
      <span class="nc-badge ${severityClass(auditVariant)}">${escapeHtml(auditVariant?.severity ?? "指摘なし")}</span>
      <button type="button" class="nc-button nc-button--ghost sb-lightbox__close" data-sb-action="close">閉じる (Esc)</button>
    </div>
    <div class="sb-lightbox__nav">
      <button type="button" data-sb-action="prev-variant" class="nc-button">◀ 前 variant</button>
      <span class="sb-lightbox__variant-label">${escapeHtml(proposalId)} / profile: ${escapeHtml(proposal?.generation_profile ?? "-")}</span>
      <button type="button" data-sb-action="next-variant" class="nc-button">次 variant ▶</button>
    </div>
    <div class="sb-lightbox__stage">
      <button type="button" data-sb-action="prev-page" class="nc-button" ${totalPages <= 1 ? "disabled" : ""}>◀ 前 P</button>
      ${
        currentSvg
          ? `<img class="sb-lightbox__svg" src="${escapeHtml(currentSvg)}" alt="page ${currentPageIndex + 1}" />`
          : '<div class="sb-lightbox__svg" role="img" aria-label="preview missing"></div>'
      }
      <button type="button" data-sb-action="next-page" class="nc-button" ${totalPages <= 1 ? "disabled" : ""}>次 P ▶</button>
      <span class="sb-lightbox__page-count">P${totalPages ? currentPageIndex + 1 : 0} / ${totalPages}</span>
    </div>
    ${renderAuditPanel(config.audit, auditVariant)}
    <div class="sb-lightbox__thumbs">${thumbs}</div>
    <div class="sb-lightbox__actions">
      <button type="button" class="nc-button nc-button--primary" data-sb-action="adopt">このバリエーションを採用 (a)</button>
      <button type="button" class="nc-button nc-button--secondary" data-sb-action="regen">再生成 3 案 (g)</button>
      <button type="button" class="nc-button nc-button--ghost" data-sb-action="audit">再検査 (u)</button>
    </div>
  </div>
</div>`;
    };

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest<HTMLElement>("[data-sb-action]")?.dataset.sbAction;
      if (!action) {
        if (target.matches("[data-sb-lightbox-overlay]")) cleanup({ status: "cancelled" });
        return;
      }
      if (action === "close") cleanup({ status: "cancelled" });
      else if (action === "prev-variant") setCurrentVariant(currentIndex - 1);
      else if (action === "next-variant") setCurrentVariant(currentIndex + 1);
      else if (action === "prev-page") setCurrentPage(currentPageIndex - 1);
      else if (action === "next-page") setCurrentPage(currentPageIndex + 1);
      else if (action === "select-variant") {
        const proposalId = target.closest<HTMLElement>("[data-sb-proposal-id]")?.dataset.sbProposalId;
        const index = config.proposals.findIndex((candidate) => candidate.proposal_id === proposalId);
        if (index >= 0) setCurrentVariant(index);
      } else if (action === "adopt") void adoptCurrent();
      else if (action === "regen") void regen();
      else if (action === "audit") void audit();
    });

    document.addEventListener("keydown", onKeydown, { capture: true });
    render();
  });
}
