import { spawn } from "node:child_process";
import type http from "node:http";
import { REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function run(cmd: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: REPO_ROOT, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => { stdout += buf.toString("utf-8"); });
    child.stderr.on("data", (buf) => { stderr += buf.toString("utf-8"); });
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: String(error) }));
  });
}

export async function handleAiEditDiff(res: http.ServerResponse): Promise<void> {
  const [stat, diff] = await Promise.all([
    run("git", ["diff", "--stat"]),
    run("git", ["diff", "--", "."]),
  ]);
  return send(res, 200, {
    stat: stat.stdout || stat.stderr,
    diff: (diff.stdout || diff.stderr).split(/\r?\n/).slice(0, 200).join("\n"),
  });
}

export async function handleAiEditCommit(
  body: { message?: unknown },
  res: http.ServerResponse
): Promise<void> {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 500) {
    return send(res, 400, { error: "commit message must be 1..500 chars" });
  }
  const add = await run("git", ["add", "-A"]);
  if (add.code !== 0) return send(res, 500, { error: add.stderr || add.stdout || "git add failed" });
  const commit = await run("git", ["commit", "-m", message]);
  if (commit.code !== 0) return send(res, 500, { error: commit.stderr || commit.stdout || "git commit failed" });
  const sha = await run("git", ["rev-parse", "HEAD"]);
  return send(res, 200, { ok: true, sha: sha.stdout.trim() });
}

export async function handleAiEditDiscard(res: http.ServerResponse): Promise<void> {
  const checkout = await run("git", ["checkout", "--", "."]);
  if (checkout.code !== 0) return send(res, 500, { error: checkout.stderr || checkout.stdout || "git checkout failed" });
  const clean = await run("git", ["clean", "-fd"]);
  if (clean.code !== 0) return send(res, 500, { error: clean.stderr || clean.stdout || "git clean failed" });
  return send(res, 200, { ok: true });
}
