/**
 * L99 AI Edit — Codex CLI を Console から spawn して任意の編集指示を実行する。
 */
import "../_env";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "./_paths";

type Args = {
  slug?: string;
  prompt?: string;
  target?: string;
  autoCommit: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { autoCommit: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--auto-commit") {
      args.autoCommit = true;
    } else if (key === "--slug") {
      args.slug = next;
      i++;
    } else if (key === "--prompt") {
      args.prompt = next;
      i++;
    } else if (key === "--target") {
      args.target = next;
      i++;
    } else {
      throw new Error(`unknown arg: ${key}`);
    }
  }
  return args;
}

function run(cmd: string, argv: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { stdio: "inherit", cwd: REPO_ROOT });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[L99] ${cmd} failed:`, error);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) throw new Error("--slug is required");
  if (!args.prompt || args.prompt.trim().length === 0) throw new Error("--prompt is required");

  const codexBin = process.env.CODEX_BIN || "codex";
  const fullPrompt = args.target
    ? `編集対象ヒント: ${args.target}\n\n${args.prompt}`
    : args.prompt;

  console.log("[L99] starting Codex AI edit");
  console.log("[L99] scope:", args.slug);
  if (args.target) console.log("[L99] target:", args.target);

  const code = await run(codexBin, [
    "exec",
    "--full-auto",
    "--sandbox",
    "workspace-write",
    "--cd",
    REPO_ROOT,
    fullPrompt,
  ]);
  console.log("---");
  console.log("[L99] codex exit code:", code);
  console.log("[L99] git diff --stat");
  await run("git", ["diff", "--stat"]);

  if (args.autoCommit && code === 0) {
    const msg = `ai-edit: ${args.prompt.slice(0, 80).replace(/\s+/g, " ")}`;
    await run("git", ["commit", "-am", `${msg}\n\nCo-Authored-By: Codex CLI`]);
  }
  process.exit(code);
}

main().catch((error) => {
  console.error("[L99] failed:", error);
  process.exit(1);
});
