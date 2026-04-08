import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  enqueue,
  readQueue,
  getLatestEntries,
  dequeueNextPending,
  updateState,
  compactQueue,
  queueStats,
  type QueueConfig,
} from "./work-queue";

let cfg: QueueConfig;

beforeEach(() => {
  cfg = { baseDir: mkdtempSync(join(tmpdir(), "wq-test-")) };
});

describe("enqueue / readQueue", () => {
  it("空キューは空配列", () => {
    expect(readQueue(1, cfg)).toEqual([]);
  });

  it("追加した分が読める", () => {
    enqueue({ slug: "a", layer: 1, genre: "isekai_tsuiho_zamaa", isExploration: false }, cfg);
    enqueue({ slug: "b", layer: 1, genre: "otome_akuyaku_zamaa", isExploration: true }, cfg);
    const q = readQueue(1, cfg);
    expect(q.length).toBe(2);
    expect(q[0].slug).toBe("a");
    expect(q[1].isExploration).toBe(true);
  });

  it("デフォルトstateはpending", () => {
    enqueue({ slug: "a", layer: 2, genre: "g", isExploration: false }, cfg);
    expect(readQueue(2, cfg)[0].state).toBe("pending");
  });
});

describe("getLatestEntries", () => {
  it("同一slugは最新だけ残る", async () => {
    enqueue({ slug: "a", layer: 1, genre: "g", isExploration: false }, cfg);
    await new Promise((r) => setTimeout(r, 5));
    updateState("a", 1, "processing", {}, cfg);
    const latest = getLatestEntries(1, cfg);
    expect(latest.size).toBe(1);
    expect(latest.get("a")?.state).toBe("processing");
  });
});

describe("dequeueNextPending", () => {
  it("pendingがなければnull", () => {
    expect(dequeueNextPending(1, cfg)).toBeNull();
  });

  it("FIFO順で返す", async () => {
    enqueue({ slug: "first", layer: 1, genre: "g", isExploration: false }, cfg);
    await new Promise((r) => setTimeout(r, 5));
    enqueue({ slug: "second", layer: 1, genre: "g", isExploration: false }, cfg);
    expect(dequeueNextPending(1, cfg)?.slug).toBe("first");
  });

  it("processing状態は返さない", () => {
    enqueue({ slug: "a", layer: 1, genre: "g", isExploration: false }, cfg);
    updateState("a", 1, "processing", {}, cfg);
    expect(dequeueNextPending(1, cfg)).toBeNull();
  });
});

describe("updateState", () => {
  it("登録なしでupdateするとthrow", () => {
    expect(() => updateState("nonexistent", 1, "done", {}, cfg)).toThrow();
  });

  it("状態遷移が反映される", () => {
    enqueue({ slug: "a", layer: 1, genre: "g", isExploration: false }, cfg);
    updateState("a", 1, "done", {}, cfg);
    expect(getLatestEntries(1, cfg).get("a")?.state).toBe("done");
  });
});

describe("compactQueue", () => {
  it("done/rejected/failed が削除される", () => {
    enqueue({ slug: "a", layer: 1, genre: "g", isExploration: false }, cfg);
    enqueue({ slug: "b", layer: 1, genre: "g", isExploration: false }, cfg);
    enqueue({ slug: "c", layer: 1, genre: "g", isExploration: false }, cfg);
    updateState("a", 1, "done", {}, cfg);
    updateState("b", 1, "rejected", {}, cfg);
    // c は pending のまま
    const r = compactQueue(1, cfg);
    expect(r.before).toBe(3);
    expect(r.after).toBe(1);
    const remaining = getLatestEntries(1, cfg);
    expect(remaining.has("c")).toBe(true);
    expect(remaining.has("a")).toBe(false);
  });
});

describe("queueStats", () => {
  it("各層を集計", () => {
    enqueue({ slug: "a", layer: 1, genre: "g", isExploration: false }, cfg);
    enqueue({ slug: "b", layer: 2, genre: "g", isExploration: false }, cfg);
    updateState("b", 2, "done", {}, cfg);
    const stats = queueStats(cfg);
    expect(stats.layer1.pending).toBe(1);
    expect(stats.layer2.done).toBe(1);
    expect(stats.layer3.pending).toBe(0);
  });
});
