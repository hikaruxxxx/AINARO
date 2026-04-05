import type {
  BlacklistDetectionResult,
  BlacklistMatch,
} from "@/types/agents";

// --- NG表現定義 ---

interface BlacklistEntry {
  pattern: string; // 正規表現パターン or リテラル文字列
  category: string;
  suggestion?: string;
  isRegex?: boolean; // trueなら正規表現として扱う
  maxPerEpisode?: number; // 1話あたりの許容回数（指定なし=0回）
}

// blacklist.md + base_guidelines.md の禁止事項を統合
const BLACKLIST_ENTRIES: BlacklistEntry[] = [
  // AI臭い常套句
  {
    pattern: "と言っても過言ではない",
    category: "AI臭い常套句",
    suggestion: "具体的な描写に置き換える",
  },
  {
    pattern: "せざるを得ない",
    category: "AI臭い常套句",
    suggestion: "「〜するしかない」等に言い換える",
  },
  {
    pattern: "言うまでもなく",
    category: "AI臭い常套句",
    suggestion: "削除するか、具体的に述べる",
  },
  {
    pattern: "という事実",
    category: "AI臭い常套句",
    suggestion: "「という事実」を削除して直接書く",
  },
  {
    pattern: "ということを、私は知る由もなかった",
    category: "AI臭い常套句",
    suggestion: "伏線は描写で仕込む",
  },
  {
    pattern: "運命の歯車が動き出した",
    category: "AI臭い常套句",
    suggestion: "具体的な状況変化で表現する",
  },
  {
    pattern: "に他ならない",
    category: "AI臭い常套句",
    suggestion: "断定を直接書く",
  },
  {
    pattern: "と言えるだろう",
    category: "AI臭い常套句",
    suggestion: "断定するか削除する",
  },

  // 陳腐な感情表現
  {
    pattern: "胸の奥が熱くなる",
    category: "陳腐な感情表現",
    suggestion: "具体的な身体反応で描写する",
  },
  {
    pattern: "思わず息を呑",
    category: "陳腐な感情表現",
    suggestion: "別の驚き表現に置き換える",
  },
  {
    pattern: "心臓が早鐘を打つ",
    category: "陳腐な感情表現",
    suggestion: "1作品で1回まで。別の緊張描写を使う",
    maxPerEpisode: 1,
  },
  {
    pattern: "全身に鳥肌が立つ",
    category: "陳腐な感情表現",
    suggestion: "具体的な感覚で描写する",
  },
  {
    pattern: "言葉を失",
    category: "陳腐な感情表現",
    suggestion: "沈黙の描写で代替する",
  },

  // 冗長な修飾
  {
    pattern: "美しい美貌",
    category: "冗長な修飾",
    suggestion: "重複表現。「美貌」のみで十分",
  },
  {
    pattern: "まさにその通り",
    category: "冗長な修飾",
    suggestion: "不要な強調。削除を検討",
  },
  {
    pattern: "ある意味では",
    category: "冗長な修飾",
    suggestion: "曖昧な前置き。削除するか具体化する",
  },
  {
    pattern: "基本的には",
    category: "冗長な修飾",
    suggestion: "不要な限定。削除を検討",
  },

  // base_guidelines.mdの禁止事項（頻度制限つき）
  {
    pattern: "のだった",
    category: "文末パターン制限",
    suggestion: "1話2回まで。別の文末に変える",
    maxPerEpisode: 2,
  },
  {
    pattern: "なのである",
    category: "文末パターン制限",
    suggestion: "1話2回まで。別の文末に変える",
    maxPerEpisode: 2,
  },
  {
    pattern: "まるで.{1,20}のようだ",
    category: "比喩制限",
    suggestion: "1話1回まで。別の比喩表現を使う",
    isRegex: true,
    maxPerEpisode: 1,
  },
];

// --- 分析関数 ---

/** テキスト中の指定位置の前後コンテキストを取得 */
function getContext(text: string, position: number, radius: number = 20): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/** 全出現位置を検索 */
function findAllPositions(text: string, pattern: string, isRegex: boolean = false): number[] {
  const positions: number[] = [];

  if (isRegex) {
    const regex = new RegExp(pattern, "g");
    let match;
    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index);
    }
  } else {
    let startIndex = 0;
    while (true) {
      const index = text.indexOf(pattern, startIndex);
      if (index === -1) break;
      positions.push(index);
      startIndex = index + 1;
    }
  }

  return positions;
}

/**
 * テキストのNG表現を検出する
 */
export function analyzeBlacklist(text: string): BlacklistDetectionResult {
  const matches: BlacklistMatch[] = [];

  for (const entry of BLACKLIST_ENTRIES) {
    const positions = findAllPositions(text, entry.pattern, entry.isRegex);

    if (positions.length === 0) continue;

    // 許容回数以内ならスキップ
    const maxAllowed = entry.maxPerEpisode ?? 0;
    if (positions.length <= maxAllowed) continue;

    // 許容回数超過分のみ報告
    const reportPositions = maxAllowed > 0 ? positions.slice(maxAllowed) : positions;

    // 表示用のパターン文字列
    const displayPattern = entry.isRegex
      ? text.slice(
          positions[0],
          positions[0] + (text.slice(positions[0]).match(new RegExp(entry.pattern))?.[0]?.length ?? entry.pattern.length)
        )
      : entry.pattern;

    matches.push({
      expression: displayPattern,
      category: entry.category,
      positions: reportPositions,
      suggestion: entry.suggestion,
      context: getContext(text, reportPositions[0]),
    });
  }

  // 重複度チェック（同じ表現が超過している場合の追加情報）
  const totalMatches = matches.reduce((sum, m) => sum + m.positions.length, 0);

  let severity: BlacklistDetectionResult["severity"];
  if (totalMatches === 0) {
    severity = "clean";
  } else if (totalMatches <= 2) {
    severity = "minor";
  } else if (totalMatches <= 5) {
    severity = "warning";
  } else {
    severity = "critical";
  }

  const summary = generateSummary(totalMatches, severity, matches);

  return { totalMatches, severity, matches, summary };
}

function generateSummary(
  totalMatches: number,
  severity: BlacklistDetectionResult["severity"],
  matches: BlacklistMatch[]
): string {
  if (severity === "clean") {
    return "NG表現は検出されませんでした。";
  }

  const severityLabel = {
    minor: "軽微",
    warning: "要注意",
    critical: "要修正",
  }[severity];

  // カテゴリ別の集計
  const categoryCount: Record<string, number> = {};
  for (const m of matches) {
    categoryCount[m.category] = (categoryCount[m.category] || 0) + m.positions.length;
  }

  const categoryBreakdown = Object.entries(categoryCount)
    .map(([cat, count]) => `${cat}: ${count}件`)
    .join("、");

  return `NG表現${totalMatches}件検出（${severityLabel}）。${categoryBreakdown}。`;
}
