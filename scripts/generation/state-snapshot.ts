// 長編生成パイプライン v3 - 状態スナップショット管理
//
// 各話生成時に呼び出し、HP/MP/スキル/関係性を話を跨いで連続させる。
// LLM呼び出しなし。
//
// 使い方:
//   読み: npx tsx scripts/generation/state-snapshot.ts get <slug> <ep_number>
//   初期化: npx tsx scripts/generation/state-snapshot.ts init <slug>
//   差分検証: npx tsx scripts/generation/state-snapshot.ts diff <slug> <ep_number>

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const WORKS_DIR = "data/generation/works";

interface StatBlock {
  current: number;
  max: number;
}

interface SkillEntry {
  name: string;
  level: number;
  exp: number;
  exp_to_next: number;
}

interface ItemEntry {
  name: string;
  qty: number;
}

interface MoneyEntry {
  金貨?: number;
  銀貨?: number;
  銅貨?: number;
}

interface RelationshipChange {
  name: string;
  delta: string;
}

interface StateSnapshot {
  episode: number;
  chapter: number;
  pattern_used: string;
  status: {
    hp: StatBlock;
    mp: StatBlock;
    attack: StatBlock;
    defense: StatBlock;
    speed: StatBlock;
    intelligence: StatBlock;
    luck: StatBlock;
  };
  skills: SkillEntry[];
  items: ItemEntry[];
  money: MoneyEntry;
  location: string;
  relationships_changed: RelationshipChange[];
  mysteries_revealed: string[];
  skill_acquired: string[];
  diff_from_previous: {
    hp_max_delta: number;
    mp_max_delta: number;
    attack_max_delta: number;
    defense_max_delta: number;
    speed_max_delta: number;
    intelligence_max_delta: number;
    luck_max_delta: number;
    skill_count_delta: number;
    skill_exp_total_delta: number;
  };
}

function statePath(slug: string, ep: number): string {
  const epPad = ep.toString().padStart(4, "0");
  return join(WORKS_DIR, slug, "longform", "episodes", `ep${epPad}_state.json`);
}

function loadState(slug: string, ep: number): StateSnapshot | null {
  const p = statePath(slug, ep);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as StateSnapshot;
}

function getInitialState(): StateSnapshot {
  // 異世界転生主人公の初期値（ヘルモード型）
  return {
    episode: 0,
    chapter: 0,
    pattern_used: "",
    status: {
      hp: { current: 10, max: 10 },
      mp: { current: 10, max: 10 },
      attack: { current: 1, max: 1 },
      defense: { current: 1, max: 1 },
      speed: { current: 1, max: 1 },
      intelligence: { current: 1, max: 1 },
      luck: { current: 1, max: 1 },
    },
    skills: [],
    items: [],
    money: { 金貨: 0, 銀貨: 0, 銅貨: 0 },
    location: "",
    relationships_changed: [],
    mysteries_revealed: [],
    skill_acquired: [],
    diff_from_previous: {
      hp_max_delta: 0,
      mp_max_delta: 0,
      attack_max_delta: 0,
      defense_max_delta: 0,
      speed_max_delta: 0,
      intelligence_max_delta: 0,
      luck_max_delta: 0,
      skill_count_delta: 0,
      skill_exp_total_delta: 0,
    },
  };
}

function diffState(prev: StateSnapshot, current: StateSnapshot): {
  monotonic: boolean;
  violations: string[];
  diff_summary: string[];
} {
  const violations: string[] = [];
  const diffSummary: string[] = [];

  // ステータス最大値の単調性チェック
  const statKeys: Array<keyof StateSnapshot["status"]> = [
    "hp",
    "mp",
    "attack",
    "defense",
    "speed",
    "intelligence",
    "luck",
  ];
  for (const key of statKeys) {
    const prevMax = prev.status[key].max;
    const currentMax = current.status[key].max;
    if (currentMax < prevMax) {
      violations.push(`${key}.max が減少: ${prevMax} → ${currentMax}`);
    }
    if (currentMax > prevMax) {
      diffSummary.push(`${key}.max: ${prevMax} → ${currentMax} (+${currentMax - prevMax})`);
    }
  }

  // スキル一覧の単調拡大チェック
  const prevSkillNames = new Set(prev.skills.map((s) => s.name));
  const currentSkillNames = new Set(current.skills.map((s) => s.name));
  for (const name of prevSkillNames) {
    if (!currentSkillNames.has(name)) {
      violations.push(`スキル「${name}」が消失`);
    }
  }
  const newSkills = [...currentSkillNames].filter((n) => !prevSkillNames.has(n));
  if (newSkills.length > 0) {
    diffSummary.push(`新規スキル: ${newSkills.join(", ")}`);
  }

  // スキル経験値の単調性
  for (const skill of current.skills) {
    const prevSkill = prev.skills.find((s) => s.name === skill.name);
    if (prevSkill) {
      if (skill.level < prevSkill.level) {
        violations.push(`スキル「${skill.name}」のレベル減少: ${prevSkill.level} → ${skill.level}`);
      }
      // 同レベル内では exp は増加（レベル上昇時はリセットされる）
      if (skill.level === prevSkill.level && skill.exp < prevSkill.exp) {
        violations.push(`スキル「${skill.name}」の経験値減少: ${prevSkill.exp} → ${skill.exp}`);
      }
    }
  }

  return {
    monotonic: violations.length === 0,
    violations,
    diff_summary: diffSummary,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "init") {
    const slug = args[1];
    if (!slug) {
      console.error("Usage: state-snapshot init <slug>");
      process.exit(1);
    }
    const state = getInitialState();
    const p = statePath(slug, 0);
    writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
    console.log(`[OK] initial state written: ${p}`);
    return;
  }

  if (cmd === "get") {
    const slug = args[1];
    const ep = parseInt(args[2] ?? "0", 10);
    if (!slug) {
      console.error("Usage: state-snapshot get <slug> <ep_number>");
      process.exit(1);
    }
    const state = loadState(slug, ep);
    if (!state) {
      console.error(`[ERROR] state not found: ep${ep}`);
      process.exit(1);
    }
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (cmd === "diff") {
    const slug = args[1];
    const ep = parseInt(args[2] ?? "1", 10);
    if (!slug || ep < 1) {
      console.error("Usage: state-snapshot diff <slug> <ep_number(>=1)>");
      process.exit(1);
    }
    const prev = loadState(slug, ep - 1);
    const current = loadState(slug, ep);
    if (!prev) {
      console.error(`[ERROR] previous state not found: ep${ep - 1}`);
      process.exit(1);
    }
    if (!current) {
      console.error(`[ERROR] current state not found: ep${ep}`);
      process.exit(1);
    }
    const result = diffState(prev, current);
    console.log(`=== State diff: ep${ep - 1} → ep${ep} ===`);
    console.log(`単調性: ${result.monotonic ? "✅ OK" : "❌ NG"}`);
    if (result.violations.length > 0) {
      console.log("違反:");
      result.violations.forEach((v) => console.log(`  - ${v}`));
    }
    if (result.diff_summary.length > 0) {
      console.log("差分:");
      result.diff_summary.forEach((d) => console.log(`  - ${d}`));
    }
    process.exit(result.monotonic ? 0 : 2);
    return;
  }

  console.error("Usage:");
  console.error("  state-snapshot init <slug>");
  console.error("  state-snapshot get <slug> <ep_number>");
  console.error("  state-snapshot diff <slug> <ep_number>");
  process.exit(1);
}

main();

// 他スクリプトからの import 用
export { loadState, diffState, getInitialState, statePath };
export type { StateSnapshot };
