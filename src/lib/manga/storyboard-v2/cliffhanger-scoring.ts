/**
 * Cliffhanger Scoring: 巻末 cliffhanger の N=5 候補生成 + pairwise tournament 選別。
 *
 * Codex + Claude 議論 (2026-05-20) で 4 ドメイン契約の Domain C として確定。
 * 巻末 episode の cliffhanger_hook は次巻購入の最大のレバー。生成 1 本では
 * 弱い可能性があるため、複数候補 → round-robin pairwise tournament で勝者を選ぶ。
 *
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 5.1
 *
 * 既存 src/lib/screening/pairwise.ts は Swiss-system リーグで重いため、
 * 巻末 1 回の N=5 比較には軽量な round-robin 実装を採用 (N*(N-1)/2 = 10 matches)。
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { VolumeEpisodePlan } from "./volume-plot";

export type CliffhangerCandidate = {
  /** "C01" 形式 */
  candidate_id: string;
  /** 巻末 cliffhanger 本文 100-200字 */
  cliffhanger_hook: string;
  /** 次巻冒頭で受ける hook 60-100字 */
  next_episode_hook: string;
  /** この候補を選んだ理由 60字 */
  rationale: string;
  /** 0-1、生成側 LLM の自己採点 (参考値) */
  self_score?: number;
};

export type CliffhangerMatch = {
  a_id: string;
  b_id: string;
  /** どちらが勝ったか */
  winner_id: string;
  /** 判定理由 80字 */
  reason: string;
};

export type CliffhangerSelectionResult = {
  winner: CliffhangerCandidate;
  /** prefix ordered by win count desc */
  ranking: Array<{ candidate_id: string; win_count: number }>;
  matches: CliffhangerMatch[];
  /** 採用根拠 80字 (winner の cliffhanger 強度の説明) */
  selection_rationale: string;
};

/**
 * Codex で N 個の cliffhanger 候補を一括生成する。
 *
 * 1 回の Codex 呼び出しで N 本の独立した候補を出させる方が、N 回呼び出すより
 * (1) 候補同士の差別化が効きやすい、(2) Pro 枠消費が少ない、ため一括採用。
 */
export async function generateCliffhangerCandidates(args: {
  bible: BibleSnapshotV2;
  volumeNo: number;
  episode: VolumeEpisodePlan;
  prevEpisode?: VolumeEpisodePlan;
  /** true: 次巻買い誘導が最重要、false: 次話誘導が最重要 */
  isVolumeEnd: boolean;
  n: number;
  cwd?: string;
  timeoutMs?: number;
}): Promise<CliffhangerCandidate[]> {
  const ep = args.episode;
  const positioning = args.isVolumeEnd
    ? `巻末 (vol ${args.volumeNo} 最終話)。次巻買い誘導が最重要。`
    : `話末 (ep ${ep.episode_no})。次話遷移が最重要。`;
  const result = await runCodexText({
    task: [
      `あなたは商業漫画の編集者として、以下 episode の cliffhanger を ${args.n} 個 独立に設計してください。`,
      "",
      "## ポジショニング",
      positioning,
      "",
      "## 対象 episode",
      `- volume_no: ${args.volumeNo}`,
      `- episode_no: ${ep.episode_no}`,
      `- title: ${ep.title_working}`,
      `- theme: ${ep.theme}`,
      `- page_target: ${ep.page_target}`,
      `- protagonist_arc end: ${ep.protagonist_arc.end}`,
      ep.core_hook_usage ? `- core_hook_usage: ${ep.core_hook_usage}` : "",
      `- 現在の cliffhanger_hook (生成元、参考): ${ep.cliffhanger_hook}`,
      "",
      args.prevEpisode
        ? `## 前話 ep${args.prevEpisode.episode_no} cliffhanger\n${args.prevEpisode.cliffhanger_hook}`
        : "",
      "",
      "## 設計指針",
      "- 各候補は **方向性が異なる** こと (情報開示型 / 関係性緊張型 / 物理的脅威型 / 価値観反転型 / 自己同定型 等)",
      "- 100-200字で本文、60-100字で next_episode_hook、60字で rationale",
      args.isVolumeEnd
        ? "- 巻末: 1 巻分の読者投資を回収しつつ、次巻を必ず買わせる「未解決の重し」を残す。volume_spine.volume_end_buy_question と一致 or 進化させる"
        : "- 話末: 次話を必ず開かせる引きの強度を持つ。foreshadow と連動可",
      "- AI 補完っぽい奇抜さは避ける。商業漫画として読者に「分かる」引きにする",
      "",
      "## 出力スキーマ",
      "```typescript",
      `type Output = {
  candidates: Array<{
    candidate_id: string;          // "C01" "C02" ... の形式
    cliffhanger_hook: string;      // 100-200字
    next_episode_hook: string;     // 60-100字
    rationale: string;             // 60字、設計思想
    self_score?: number;           // 0-1、自己採点 (参考値、参考用 optional)
  }>;
};`,
      "```",
      "",
      "## 出力形式",
      `${args.n} 個の候補を含む JSON のみを返してください。説明文・前置き・後書きは不要。`,
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ]
      .filter(Boolean)
      .join("\n"),
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 6 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) {
    throw new Error("cliffhanger candidates JSON 抽出失敗");
  }
  const parsed = result.parsed as { candidates?: CliffhangerCandidate[] };
  if (!parsed.candidates || parsed.candidates.length < 2) {
    throw new Error(
      `cliffhanger candidates 検証失敗: count=${parsed.candidates?.length} (≥ 2 必須)`,
    );
  }
  // candidate_id 一意性 (LLM が重複させた場合は後勝ち)
  const seenIds = new Set<string>();
  for (let i = 0; i < parsed.candidates.length; i++) {
    const c = parsed.candidates[i];
    if (seenIds.has(c.candidate_id)) {
      c.candidate_id = `C${String(i + 1).padStart(2, "0")}_fixed`;
    }
    seenIds.add(c.candidate_id);
  }
  return parsed.candidates;
}

/**
 * Round-robin pairwise tournament で勝者を選出。
 * N=5 なら 10 matches。Codex 1 回で全 matches を一括判定するため重くない。
 */
export async function selectCliffhanger(args: {
  candidates: CliffhangerCandidate[];
  context: {
    volumeNo: number;
    episode: VolumeEpisodePlan;
    isVolumeEnd: boolean;
  };
  cwd?: string;
  timeoutMs?: number;
}): Promise<CliffhangerSelectionResult> {
  const { candidates } = args;
  if (candidates.length < 2) {
    throw new Error("pairwise tournament には候補 2 個以上必要");
  }
  if (candidates.length === 1) {
    return {
      winner: candidates[0],
      ranking: [{ candidate_id: candidates[0].candidate_id, win_count: 0 }],
      matches: [],
      selection_rationale: "候補 1 個のため自動採用",
    };
  }

  // round-robin matches を組む (N*(N-1)/2)
  const matchPairs: Array<[string, string]> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      matchPairs.push([candidates[i].candidate_id, candidates[j].candidate_id]);
    }
  }

  // Codex 1 回で全 matches を一括判定
  const candidatesBlock = candidates
    .map(
      (c) =>
        `### ${c.candidate_id}\n- cliffhanger_hook: ${c.cliffhanger_hook}\n- next_episode_hook: ${c.next_episode_hook}\n- rationale: ${c.rationale}`,
    )
    .join("\n\n");
  const matchPairsBlock = matchPairs
    .map(([a, b], idx) => `${idx + 1}. ${a} vs ${b}`)
    .join("\n");

  const ep = args.context.episode;
  const positioning = args.context.isVolumeEnd
    ? "巻末。次巻買いを誘導する強度を最優先で評価する。"
    : "話末。次話遷移を誘導する強度を最優先で評価する。";

  const result = await runCodexText({
    task: [
      "あなたは商業漫画の編集者として、以下の cliffhanger 候補のペアワイズ評価を行ってください。",
      "",
      "## 評価基準 (順位高 → 低)",
      "1. 読者の「続きを読まずにいられない」圧力の強さ (主観的な引き力)",
      "2. 主人公の不可逆な状態変化が予告されているか",
      "3. 既知の foreshadow / 関係性 / 中核ギミックとの整合と進化",
      "4. AI 補完っぽい奇抜さでなく、商業漫画として「分かる」引きか",
      "5. 直前の物語の重さに対する適切な比例 (軽すぎず重すぎず)",
      "",
      "## ポジショニング",
      positioning,
      "",
      "## 対象 episode 文脈",
      `- vol ${args.context.volumeNo} ep ${ep.episode_no}: ${ep.title_working}`,
      `- theme: ${ep.theme}`,
      `- protagonist_arc end: ${ep.protagonist_arc.end}`,
      "",
      "## 候補一覧",
      candidatesBlock,
      "",
      "## 評価対象ペア (round-robin)",
      matchPairsBlock,
      "",
      "## 出力スキーマ",
      "```typescript",
      `type Output = {
  matches: Array<{
    a_id: string;
    b_id: string;
    winner_id: string;           // a_id or b_id
    reason: string;              // 80字、選んだ理由
  }>;
  selection_rationale: string;   // 80字、最終勝者の cliffhanger 強度の総合説明
};`,
      "```",
      "",
      "全ペアを評価し、結果を JSON のみで返してください。",
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ].join("\n"),
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 5 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) {
    throw new Error("cliffhanger pairwise JSON 抽出失敗");
  }
  const parsed = result.parsed as {
    matches?: CliffhangerMatch[];
    selection_rationale?: string;
  };
  if (!parsed.matches || parsed.matches.length !== matchPairs.length) {
    throw new Error(
      `cliffhanger pairwise 検証失敗: matches.length=${parsed.matches?.length} ≠ expected=${matchPairs.length}`,
    );
  }

  // 勝率カウント
  const winCount = new Map<string, number>();
  for (const c of candidates) winCount.set(c.candidate_id, 0);
  for (const m of parsed.matches) {
    if (m.winner_id !== m.a_id && m.winner_id !== m.b_id) {
      // LLM が誤って候補外を返した場合は最初の候補を勝者にする
      winCount.set(m.a_id, (winCount.get(m.a_id) ?? 0) + 1);
      continue;
    }
    winCount.set(m.winner_id, (winCount.get(m.winner_id) ?? 0) + 1);
  }

  const ranking = Array.from(winCount.entries())
    .map(([candidate_id, win_count]) => ({ candidate_id, win_count }))
    .sort((a, b) => b.win_count - a.win_count);

  const winnerEntry = ranking[0];
  const winner = candidates.find((c) => c.candidate_id === winnerEntry.candidate_id);
  if (!winner) {
    throw new Error(`cliffhanger 勝者 candidate not found: ${winnerEntry.candidate_id}`);
  }

  return {
    winner,
    ranking,
    matches: parsed.matches,
    selection_rationale:
      parsed.selection_rationale ??
      `${winner.candidate_id} が ${winnerEntry.win_count}/${matchPairs.length} 勝で勝率最高`,
  };
}
