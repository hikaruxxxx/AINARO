import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import { injectContinuityGroupIds } from "../../../src/lib/manga/page-director-v2/continuity-resolve-v2";
import { resolveRefsForEpisode } from "../../../src/lib/manga/page-director-v2/refs-resolver-v2";
import type { BibleSnapshotV2, EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

const repoRoot = process.cwd();
const slug = "a07-modern-dungeon";
const episode = 1;
const epDir = path.join("data", "manga", "works", slug, "episodes", "ep01");
const workBibleDir = path.join("data", "manga", "works", slug, "bible");

let tempRoots: string[] = [];

async function copyFileIntoRoot(tempRoot: string, relativePath: string): Promise<void> {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(tempRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

async function prepareTempRoot(): Promise<{ root: string; initialPagePlan: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-l0607-"));
  tempRoots.push(root);

  await copyFileIntoRoot(root, path.join(workBibleDir, "snapshot.json"));
  await copyFileIntoRoot(root, path.join(workBibleDir, "refs", "_provenance.json"));
  await copyFileIntoRoot(root, path.join(epDir, "storyboard.json"));
  await copyFileIntoRoot(root, path.join(epDir, "page_plan.json"));
  await copyFileIntoRoot(root, path.join("data", "manga", "capability", "gpt-image-2.json"));

  const bible = await readJson<{ meta: { art_style: string } }>(
    path.join(root, workBibleDir, "snapshot.json"),
  );
  await copyFileIntoRoot(root, path.join("data", "manga", "style-plates", `${bible.meta.art_style}.png`));

  const pagePlanPath = path.join(root, epDir, "page_plan.json");
  return { root, initialPagePlan: await fs.readFile(pagePlanPath, "utf-8") };
}

async function runLegacyChain(root: string): Promise<void> {
  const bible = await readJson<BibleSnapshotV2>(path.join(root, workBibleDir, "snapshot.json"));
  const storyboard = await readJson<EpisodeStoryboardV2>(path.join(root, epDir, "storyboard.json"));
  const pagePlanPath = path.join(root, epDir, "page_plan.json");
  const pagePlan = await readJson<PagePlanV2>(pagePlanPath);
  const updated = injectContinuityGroupIds({ pagePlan, storyboard, bible });
  await fs.writeFile(pagePlanPath, JSON.stringify(updated, null, 2));

  const capability = await loadCapabilityProfile(path.join(root, "data", "manga", "capability", "gpt-image-2.json"));
  const stylePlatePath = path.join(root, "data", "manga", "style-plates", `${bible.meta.art_style}.png`);
  const resolved = await resolveRefsForEpisode({
    pagePlan: updated,
    storyboard,
    bible,
    refsDir: path.join(root, workBibleDir, "refs"),
    capability,
    stylePlatePath,
  });
  await fs.writeFile(path.join(root, epDir, "resolved_refs.json"), JSON.stringify(resolved, null, 2));
}

async function runSingle(root: string): Promise<void> {
  const previousRoot = process.env.AINARO_REPO_ROOT;
  process.env.AINARO_REPO_ROOT = root;
  vi.resetModules();
  try {
    const mod = await import("./L0607-resolve");
    await mod.runL0607Resolve({ slug, episode });
  } finally {
    if (previousRoot === undefined) delete process.env.AINARO_REPO_ROOT;
    else process.env.AINARO_REPO_ROOT = previousRoot;
  }
}

describe("L0607 resolve", () => {
  afterEach(async () => {
    const roots = tempRoots;
    tempRoots = [];
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it(
    "matches the legacy L06 -> L07 chain for a07-modern-dungeon ep01",
    async () => {
      const { root, initialPagePlan } = await prepareTempRoot();
      const pagePlanPath = path.join(root, epDir, "page_plan.json");
      const resolvedRefsPath = path.join(root, epDir, "resolved_refs.json");

      await runLegacyChain(root);
      const legacyPagePlan = await readJson<unknown>(pagePlanPath);
      const legacyResolvedRefs = await readJson<unknown>(resolvedRefsPath);

      await fs.writeFile(pagePlanPath, initialPagePlan);
      await fs.rm(resolvedRefsPath, { force: true });

      await runSingle(root);
      const singlePagePlan = await readJson<unknown>(pagePlanPath);
      const singleResolvedRefs = await readJson<unknown>(resolvedRefsPath);

      expect(singlePagePlan).toEqual(legacyPagePlan);
      expect(singleResolvedRefs).toEqual(legacyResolvedRefs);
    },
    120_000,
  );
});
