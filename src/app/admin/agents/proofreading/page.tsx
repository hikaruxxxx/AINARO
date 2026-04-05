"use client";

import { useState } from "react";
import type {
  ProofreadingResult,
  BlacklistDetectionResult,
  StyleConsistencyResult,
  CharacterConsistency,
} from "@/types/agents";

// --- 共通ヘルパー ---

function gradeColor(grade: string): string {
  switch (grade) {
    case "S": return "text-purple-600";
    case "A": return "text-blue-600";
    case "B": return "text-green-600";
    case "C": return "text-yellow-600";
    case "D": return "text-red-600";
    default: return "text-gray-600";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

// --- NG表現セクション ---

function severityColor(severity: BlacklistDetectionResult["severity"]): string {
  switch (severity) {
    case "clean": return "text-green-500";
    case "minor": return "text-yellow-500";
    case "warning": return "text-orange-500";
    case "critical": return "text-red-500";
  }
}

function severityLabel(severity: BlacklistDetectionResult["severity"]): string {
  switch (severity) {
    case "clean": return "問題なし";
    case "minor": return "軽微";
    case "warning": return "要注意";
    case "critical": return "要修正";
  }
}

function categoryTag(category: string): string {
  switch (category) {
    case "AI臭い常套句": return "AI臭";
    case "陳腐な感情表現": return "陳腐";
    case "冗長な修飾": return "冗長";
    case "文末パターン制限": return "文末";
    case "比喩制限": return "比喩";
    default: return category;
  }
}

// --- 入力型 ---

interface CharacterInput {
  name: string;
  speechPatterns: string;
  innerSpeechPatterns: string;
}

// --- タブ ---

type TabId = "overview" | "blacklist" | "style" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "総合" },
  { id: "blacklist", label: "NG表現" },
  { id: "style", label: "文体" },
  { id: "settings", label: "設定整合" },
];

// --- メインコンポーネント ---

export default function ProofreadingPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ProofreadingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // スタイルプロファイル
  const [sentenceLengthAvg, setSentenceLengthAvg] = useState(20);
  const [dialogueRatio, setDialogueRatio] = useState(0.4);
  const [innerMonologueRatio, setInnerMonologueRatio] = useState(0.3);
  const [tempo, setTempo] = useState<"slow" | "medium" | "fast">("fast");
  const [lineBreakFrequency, setLineBreakFrequency] = useState<"sparse" | "normal" | "frequent">("frequent");

  // キャラクター設定
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { name: "リゼット", speechPatterns: "ですわ,ではなくて？", innerSpeechPatterns: "マジで,無理,攻略wiki" },
    { name: "クロード", speechPatterns: "……そうか,好きにしろ", innerSpeechPatterns: "" },
    { name: "エレーヌ", speechPatterns: "あの、,リゼット様", innerSpeechPatterns: "" },
  ]);

  // 世界観用語
  const [worldTerms, setWorldTerms] = useState("ラシェール王国,聖リュミエール学園,花冠の儀,ヴァルモン,恩寵");

  // 設定パネルの開閉
  const [showConfig, setShowConfig] = useState(false);

  const charCount = [...text].length;

  function addCharacter() {
    setCharacters([...characters, { name: "", speechPatterns: "", innerSpeechPatterns: "" }]);
  }

  function removeCharacter(index: number) {
    setCharacters(characters.filter((_, i) => i !== index));
  }

  function updateCharacter(index: number, field: keyof CharacterInput, value: string) {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
  }

  async function handleProofread() {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/agents/proofreading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          styleProfile: {
            sentenceLengthAvg,
            dialogueRatio,
            innerMonologueRatio,
            tempo,
            lineBreakFrequency,
          },
          settings: {
            characters: characters
              .filter((c) => c.name.trim())
              .map((c) => ({
                name: c.name.trim(),
                speechPatterns: c.speechPatterns.split(",").map((p) => p.trim()).filter(Boolean),
                innerSpeechPatterns: c.innerSpeechPatterns
                  ? c.innerSpeechPatterns.split(",").map((p) => p.trim()).filter(Boolean)
                  : undefined,
              })),
            worldBuilding: {
              terms: worldTerms.split(",").map((t) => t.trim()).filter(Boolean),
              rules: [],
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "校正に失敗しました");
        return;
      }
      setResult(data);
      setActiveTab("overview");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text">校正エージェント</h2>
        <p className="mt-1 text-sm text-muted">
          NG表現・文体一貫性・設定整合性を一括チェックします
        </p>
      </div>

      {/* 設定パネル（折りたたみ） */}
      <div className="rounded-lg border border-border bg-surface">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <h3 className="text-sm font-bold text-text">設定（文体プロファイル・キャラクター・世界観）</h3>
          <span className="text-xs text-muted">{showConfig ? "閉じる" : "開く"}</span>
        </button>

        {showConfig && (
          <div className="space-y-4 border-t border-border p-4">
            {/* 文体プロファイル */}
            <div>
              <h4 className="mb-2 text-xs font-bold text-muted">文体プロファイル</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="block text-xs text-muted">平均文長</label>
                  <input
                    type="number"
                    value={sentenceLengthAvg}
                    onChange={(e) => setSentenceLengthAvg(Number(e.target.value))}
                    min={5} max={100}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">会話比率</label>
                  <input
                    type="number"
                    value={dialogueRatio}
                    onChange={(e) => setDialogueRatio(Number(e.target.value))}
                    min={0} max={1} step={0.05}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">独白比率</label>
                  <input
                    type="number"
                    value={innerMonologueRatio}
                    onChange={(e) => setInnerMonologueRatio(Number(e.target.value))}
                    min={0} max={1} step={0.05}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">テンポ</label>
                  <select
                    value={tempo}
                    onChange={(e) => setTempo(e.target.value as "slow" | "medium" | "fast")}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  >
                    <option value="fast">速い</option>
                    <option value="medium">普通</option>
                    <option value="slow">遅い</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted">改行頻度</label>
                  <select
                    value={lineBreakFrequency}
                    onChange={(e) => setLineBreakFrequency(e.target.value as "sparse" | "normal" | "frequent")}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  >
                    <option value="frequent">多め</option>
                    <option value="normal">普通</option>
                    <option value="sparse">少なめ</option>
                  </select>
                </div>
              </div>
            </div>

            {/* キャラクター設定 */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold text-muted">キャラクター設定</h4>
                <button onClick={addCharacter} className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300">+ 追加</button>
              </div>
              <div className="space-y-2">
                {characters.map((char, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-border p-2">
                    <input
                      value={char.name}
                      onChange={(e) => updateCharacter(i, "name", e.target.value)}
                      placeholder="名前"
                      className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs font-bold text-text"
                    />
                    <input
                      value={char.speechPatterns}
                      onChange={(e) => updateCharacter(i, "speechPatterns", e.target.value)}
                      placeholder="口調パターン（カンマ区切り）"
                      className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text"
                    />
                    <input
                      value={char.innerSpeechPatterns}
                      onChange={(e) => updateCharacter(i, "innerSpeechPatterns", e.target.value)}
                      placeholder="独白パターン"
                      className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text"
                    />
                    {characters.length > 1 && (
                      <button onClick={() => removeCharacter(i)} className="text-xs text-red-500 hover:text-red-700">x</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 世界観 */}
            <div>
              <h4 className="mb-2 text-xs font-bold text-muted">世界観の固有名詞</h4>
              <input
                value={worldTerms}
                onChange={(e) => setWorldTerms(e.target.value)}
                placeholder="カンマ区切りで入力"
                className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
              />
            </div>
          </div>
        )}
      </div>

      {/* テキスト入力 */}
      <div className="space-y-2">
        <label htmlFor="input-text" className="block text-sm font-medium text-text">
          校正するテキスト
        </label>
        <textarea
          id="input-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="生成した小説テキストを貼り付けてください（200文字以上）"
          rows={14}
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{charCount}文字</span>
          {charCount > 0 && charCount < 200 && (
            <span className="text-red-500">あと{200 - charCount}文字必要です</span>
          )}
        </div>
      </div>

      {/* 校正ボタン */}
      <button
        onClick={handleProofread}
        disabled={loading || charCount < 200}
        className="rounded-lg bg-primary px-8 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "校正中..." : "一括校正"}
      </button>

      {/* エラー */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* 結果 */}
      {result && (
        <div className="space-y-4">
          {/* タブナビゲーション */}
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-primary text-white"
                    : "text-muted hover:bg-gray-100 hover:text-text"
                }`}
              >
                {tab.label}
                {tab.id === "blacklist" && result.blacklist.totalMatches > 0 && (
                  <span className="ml-1 inline-block rounded-full bg-red-100 px-1.5 text-xs text-red-600">
                    {result.blacklist.totalMatches}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 総合タブ */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* 総合スコア */}
              <div className="rounded-lg border border-border bg-surface p-6">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className={`text-5xl font-bold ${gradeColor(result.grade)}`}>{result.grade}</div>
                    <div className="mt-1 text-lg font-bold text-text">{result.overallScore}点</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-text leading-relaxed">{result.summary}</p>
                  </div>
                </div>
              </div>

              {/* 3観点サマリー */}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "NG表現",
                    tab: "blacklist" as TabId,
                    score: { clean: 100, minor: 80, warning: 55, critical: 20 }[result.blacklist.severity],
                    detail: `${result.blacklist.totalMatches}件検出`,
                  },
                  {
                    label: "文体一貫性",
                    tab: "style" as TabId,
                    score: result.style.overallScore,
                    detail: `${result.style.grade}ランク`,
                  },
                  {
                    label: "設定整合性",
                    tab: "settings" as TabId,
                    score: result.settings.overallScore,
                    detail: `${result.settings.characters.filter((c: CharacterConsistency) => c.found).length}名登場`,
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setActiveTab(item.tab)}
                    className="rounded-lg border border-border bg-surface p-4 text-left transition hover:border-primary"
                  >
                    <div className="text-xs text-muted">{item.label}</div>
                    <div className={`mt-1 text-2xl font-bold ${scoreColor(item.score)}`}>{item.score}</div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className={`h-full rounded-full ${barColor(item.score)}`} style={{ width: `${item.score}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-muted">{item.detail}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* NG表現タブ */}
          {activeTab === "blacklist" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${severityColor(result.blacklist.severity)}`}>
                    {severityLabel(result.blacklist.severity)}
                  </span>
                  <span className="text-sm text-muted">{result.blacklist.summary}</span>
                </div>
              </div>

              {result.blacklist.matches.length > 0 && (
                <div className="space-y-3">
                  {result.blacklist.matches.map((match, i) => (
                    <div key={i} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-block rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {categoryTag(match.category)}
                        </span>
                        <span className="text-sm font-bold text-text">「{match.expression}」</span>
                        {match.positions.length > 1 && (
                          <span className="text-xs text-red-500">x{match.positions.length}</span>
                        )}
                      </div>
                      <div className="mt-2 rounded bg-gray-100 p-2 text-xs font-mono text-muted">{match.context}</div>
                      {match.suggestion && (
                        <p className="mt-2 text-xs text-blue-600">提案: {match.suggestion}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.blacklist.matches.length === 0 && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-700">
                  NG表現は検出されませんでした
                </div>
              )}
            </div>
          )}

          {/* 文体タブ */}
          {activeTab === "style" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${gradeColor(result.style.grade)}`}>{result.style.grade}</span>
                  <span className="text-sm text-text">{result.style.summary}</span>
                </div>
              </div>

              {/* パラメータ別 */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-4 text-sm font-bold text-text">パラメータ別詳細</h3>
                <div className="space-y-4">
                  {Object.entries(result.style.params).map(([key, param]) => (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-text">{param.name}</span>
                        <span className="text-xs text-muted">
                          目標: {String(param.target)} / 実測: {String(param.actual)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full ${barColor(100 - param.deviation)}`}
                          style={{ width: `${100 - param.deviation}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">{param.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ガイドライン違反 */}
              {result.style.guidelineViolations.length > 0 && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-orange-700">
                    ガイドライン違反（{result.style.guidelineViolations.length}件）
                  </h3>
                  <ul className="space-y-1">
                    {result.style.guidelineViolations.map((v, i) => (
                      <li key={i} className="text-sm text-orange-800">- {v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 設定整合タブ */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${scoreColor(result.settings.overallScore)}`}>
                    {result.settings.overallScore}点
                  </span>
                  <span className="text-sm text-text">{result.settings.summary}</span>
                </div>
              </div>

              {/* キャラクター別 */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-4 text-sm font-bold text-text">キャラクター整合性</h3>
                <div className="space-y-3">
                  {result.settings.characters.map((char: CharacterConsistency, i: number) => (
                    <div key={i} className="rounded border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text">{char.name}</span>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                            char.found ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                          }`}>
                            {char.found ? "登場" : "未登場"}
                          </span>
                        </div>
                        {char.found && (
                          <span className={`text-sm font-bold ${scoreColor(char.speechPatternMatch)}`}>
                            口調 {char.speechPatternMatch}%
                          </span>
                        )}
                      </div>
                      {char.found && (
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${barColor(char.speechPatternMatch)}`}
                            style={{ width: `${char.speechPatternMatch}%` }}
                          />
                        </div>
                      )}
                      {char.issues.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {char.issues.map((issue, j) => (
                            <li key={j} className="text-xs text-orange-600">- {issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 世界観問題 */}
              {result.settings.worldBuildingIssues.length > 0 && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-orange-700">
                    世界観の整合性（{result.settings.worldBuildingIssues.length}件）
                  </h3>
                  <ul className="space-y-1">
                    {result.settings.worldBuildingIssues.map((issue, i) => (
                      <li key={i} className="text-sm text-orange-800">- {issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* プロット問題 */}
              {result.settings.plotConsistencyIssues.length > 0 && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-orange-700">
                    プロット整合性（{result.settings.plotConsistencyIssues.length}件）
                  </h3>
                  <ul className="space-y-1">
                    {result.settings.plotConsistencyIssues.map((issue, i) => (
                      <li key={i} className="text-sm text-orange-800">- {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
