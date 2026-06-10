/**
 * GET/POST /api/name-approval ハンドラ (旧 serve-name.ts:handleApi)
 *
 * scope 確定 (slug/episode の正規化と fixed-scope 一致確認) は呼び出し側 router の責務。
 * 本 handler は (slug, episode) を信頼できる前提で受け取り、保存と検証のみを行う。
 *
 * SSoT: rerun_from は client から来た値を無視して deriveRerunFrom で再計算する。
 * page_no validation は page_plan.json を fail-closed (page_plan 不在で 500) で照合する。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import {
  deriveRerunFrom,
  type NameApproval,
  type NamePageDecision,
  type NameRejectReason,
} from "../../../name-preview/types";
import type { PagePlanV2 } from "../../../schemas-v2";
import { nameApprovalPath, pagePlanPath } from "../../../../../../scripts/manga/layers/_paths";
import { withFileLock } from "../lib/lock";

function isReason(s: unknown): s is NameRejectReason {
  return (
    s === "story_problem" ||
    s === "panel_problem" ||
    s === "layout_problem" ||
    s === "dialogue_problem" ||
    s === "continuity_problem" ||
    s === "render_risk"
  );
}

const PAGE_PLAN_CACHE = new Map<string, Set<number>>();

async function loadPagePlanPageNos(slug: string, episode: number): Promise<Set<number>> {
  const key = `${slug}#${episode}`;
  const cached = PAGE_PLAN_CACHE.get(key);
  if (cached) return cached;
  const buf = await fs.readFile(pagePlanPath(slug, episode), "utf-8");
  const plan = JSON.parse(buf) as PagePlanV2;
  if (!plan?.pages || !Array.isArray(plan.pages) || plan.pages.length === 0) {
    throw new Error(`page_plan has no pages: ${pagePlanPath(slug, episode)}`);
  }
  const set = new Set<number>();
  for (const p of plan.pages) {
    if (typeof p.page_no === "number") set.add(p.page_no);
  }
  PAGE_PLAN_CACHE.set(key, set);
  return set;
}

async function loadApproval(slug: string, episode: number): Promise<NameApproval | null> {
  try {
    const buf = await fs.readFile(nameApprovalPath(slug, episode), "utf-8");
    return JSON.parse(buf) as NameApproval;
  } catch {
    return null;
  }
}

async function saveApproval(slug: string, episode: number, approval: NameApproval): Promise<void> {
  approval.updated_at = new Date().toISOString();
  const text = JSON.stringify(approval, null, 2);
  await fs.writeFile(nameApprovalPath(slug, episode), text, "utf-8");
}

export async function handleNameApprovalGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  const approval = await loadApproval(slug, episode);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(approval ?? { pages: {} }));
}

export async function handleNameApprovalPost(
  slug: string,
  episode: number,
  body: any,
  res: http.ServerResponse
): Promise<void> {
  const pageNo = Number(body?.page_no ?? 0);
  const status = body?.status as string | undefined;
  const reasonsRaw = Array.isArray(body?.reasons) ? body.reasons : [];
  const note = String(body?.note ?? "").slice(0, 500);

  if (!Number.isInteger(pageNo) || pageNo <= 0 || !status) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing or invalid fields" }));
    return;
  }
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid status" }));
    return;
  }

  let validPageNos: Set<number>;
  try {
    validPageNos = await loadPagePlanPageNos(slug, episode);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `cannot load page_plan: ${(e as Error).message}` }));
    return;
  }
  if (!validPageNos.has(pageNo)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `page_no ${pageNo} not in page_plan` }));
    return;
  }

  const reasons: NameRejectReason[] = reasonsRaw.filter(isReason);
  const rerun = deriveRerunFrom(reasons);

  const result = await withFileLock(`approval#${slug}#${episode}`, async () => {
    let approval = await loadApproval(slug, episode);
    if (!approval) {
      approval = {
        schema_version: 1,
        episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`,
        updated_at: new Date().toISOString(),
        pages: {},
      };
    }
    const now = new Date().toISOString();
    const decision: NamePageDecision = {
      status: status as NamePageDecision["status"],
      approval_source: "human",
      reasons,
      rerun_from: rerun,
      note,
      decided_at: now,
    };
    approval.pages[String(pageNo)] = decision;
    await saveApproval(slug, episode, approval);
    return decision;
  });

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: true,
      page_no: pageNo,
      status: result.status,
      rerun_from: result.rerun_from,
    })
  );
}
