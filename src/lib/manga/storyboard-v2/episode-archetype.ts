import fs from "node:fs";
import path from "node:path";

export type VisualChannel =
  | "establishing_shot"
  | "character_intro"
  | "ui_screen"
  | "action_sequence"
  | "dialogue"
  | "monologue"
  | "narration"
  | "prop_closeup"
  | "reaction_shot"
  | "visual_contrast"
  | "silence_panel"
  | "sound_effect";

export type ArchetypePhase = {
  phase: string;
  pages: string;
  channels: VisualChannel[];
  required: string[];
};

export type EpisodeArchetype = {
  id: string;
  name: string;
  distribution: number;
  description: string;
  structure: ArchetypePhase[];
  state_changes: Record<string, boolean | number>;
};

type ArchetypeDict = {
  version: string;
  subtype: string;
  patterns: EpisodeArchetype[];
};

const PATTERNS_DIR = path.join(process.cwd(), "data/manga/episode_patterns");

export function loadArchetypeDict(subtype: string): ArchetypeDict | null {
  const fp = path.join(PATTERNS_DIR, `${subtype}.json`);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as ArchetypeDict;
  } catch {
    return null;
  }
}

export function findArchetype(dict: ArchetypeDict, id: string): EpisodeArchetype | undefined {
  return dict.patterns.find((p) => p.id === id);
}

/**
 * Pass 1 用: パターン辞書全体をプロンプト文字列に変換。
 * LLM に各 episode への archetype_id 割り当てを求める。
 */
export function buildArchetypeDictPrompt(dict: ArchetypeDict): string {
  const lines: string[] = [
    "## Episode Archetype Patterns (話型辞書、必須参照)",
    "",
    "各 episode に以下のパターンから 1 つを archetype_id として割り当てること。",
    "distribution は全話に対する推奨配分率。巻内の episode 数に応じて適宜調整。",
    "",
  ];
  for (const p of dict.patterns) {
    lines.push(`### ${p.id} — ${p.name} (配分: ${Math.round(p.distribution * 100)}%)`);
    lines.push(p.description);
    lines.push("phase 構成:");
    for (const s of p.structure) {
      lines.push(`  - ${s.phase} (${s.pages}p) [${s.channels.join(", ")}]`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Pass 2 用: 特定 archetype の構造制約をプロンプト文字列に変換。
 * scene skeleton 設計時の制約として注入。
 */
export function buildArchetypeConstraints(archetype: EpisodeArchetype): string {
  const lines: string[] = [
    `## Archetype 制約: ${archetype.id} (${archetype.name})`,
    "",
    archetype.description,
    "",
    "### phase → scene 対応 (各 phase を 1 つ以上の scene でカバーすること)",
  ];
  for (const s of archetype.structure) {
    const reqs = s.required.map((r) => `    - ${r}`).join("\n");
    lines.push(`- **${s.phase}** (${s.pages} ページ)`);
    lines.push(`  主要チャネル: ${s.channels.join(", ")}`);
    lines.push(`  必須要素:\n${reqs}`);
  }
  lines.push("");
  lines.push("### Visual Channel (各 scene の primary_channels に以下から選択)");
  lines.push("establishing_shot / character_intro / ui_screen / action_sequence / dialogue / monologue / narration / prop_closeup / reaction_shot / visual_contrast / silence_panel / sound_effect");
  lines.push("");
  lines.push("各 scene の primary_channels フィールドに 1-3 個を指定すること。");
  return lines.join("\n");
}
