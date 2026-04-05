"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContentCandidate, ContentCandidatePhase } from "@/types/novel";

const PHASE_LABELS: Record<ContentCandidatePhase, string> = {
  plot: "プロット",
  pilot: "パイロット版",
  serial: "連載中",
  archived: "アーカイブ",
};

const PHASE_COLORS: Record<ContentCandidatePhase, string> = {
  plot: "bg-yellow-100 text-yellow-700",
  pilot: "bg-blue-100 text-blue-700",
  serial: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-600",
};

export default function ContentFunnelPage() {
  const [candidates, setCandidates] = useState<ContentCandidate[]>([]);
  const [summary, setSummary] = useState({ plot: 0, pilot: 0, serial: 0, archived: 0 });
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const url = filter ? `/api/admin/content-funnel?phase=${filter}` : "/api/admin/content-funnel";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setCandidates(data.candidates);
      setSummary(data.summary);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePhaseChange = async (id: string, phase: ContentCandidatePhase) => {
    await fetch(`/api/admin/content-funnel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    fetchData();
  };

  const handleEvaluate = async (id: string) => {
    const res = await fetch(`/api/admin/content-funnel/${id}/evaluate`, { method: "POST" });
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const handleDecision = async (id: string, decision: string, reason: string) => {
    await fetch(`/api/admin/content-funnel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, decision_reason: reason, decided_at: new Date().toISOString() }),
    });
    fetchData();
  };

  if (loading) {
    return <div className="py-8 text-center text-sm opacity-50">読み込み中...</div>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">コンテンツ選別ファネル</h2>

      {/* ファネルサマリー */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {(Object.entries(PHASE_LABELS) as [ContentCandidatePhase, string][]).map(([phase, label]) => (
          <button
            key={phase}
            onClick={() => setFilter(filter === phase ? "" : phase)}
            className={`rounded-xl border p-3 text-center transition ${
              filter === phase ? "border-secondary bg-secondary/5" : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-2xl font-bold">{summary[phase]}</p>
            <p className="text-xs opacity-60">{label}</p>
          </button>
        ))}
      </div>

      {/* 候補一覧 */}
      {candidates.length === 0 ? (
        <p className="text-sm opacity-50">候補がありません</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold">{c.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${PHASE_COLORS[c.phase]}`}>
                      {PHASE_LABELS[c.phase]}
                    </span>
                    {c.decision && (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        c.decision === "promote" ? "bg-green-100 text-green-700"
                          : c.decision === "revise" ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                      }`}>
                        {c.decision === "promote" ? "連載化" : c.decision === "revise" ? "改稿" : "アーカイブ"}
                      </span>
                    )}
                  </div>
                  {c.synopsis && <p className="text-sm opacity-60 line-clamp-2">{c.synopsis}</p>}
                  <div className="mt-1 flex gap-2 text-xs opacity-50">
                    <span>{c.genre}</span>
                    {c.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>

                {/* パイロットスコア */}
                {c.pilot_score !== null && (
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-secondary">{c.pilot_score.toFixed(2)}</p>
                    <p className="text-xs opacity-50">パイロットスコア</p>
                  </div>
                )}
              </div>

              {/* パイロット指標 */}
              {c.pilot_completion_rate !== null && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <div className="rounded bg-gray-50 p-2 text-center">
                    <p className="font-bold">{(c.pilot_completion_rate * 100).toFixed(1)}%</p>
                    <p className="opacity-50">読了率</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2 text-center">
                    <p className="font-bold">{c.pilot_next_rate !== null ? `${(c.pilot_next_rate * 100).toFixed(1)}%` : "-"}</p>
                    <p className="opacity-50">次話遷移率</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2 text-center">
                    <p className="font-bold">{c.pilot_bookmark_rate !== null ? `${(c.pilot_bookmark_rate * 100).toFixed(1)}%` : "-"}</p>
                    <p className="opacity-50">BM率</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2 text-center">
                    <p className="font-bold">{c.pilot_avg_read_sec !== null ? `${Math.round(c.pilot_avg_read_sec)}秒` : "-"}</p>
                    <p className="opacity-50">平均滞在</p>
                  </div>
                </div>
              )}

              {/* アクションボタン */}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.phase === "plot" && (
                  <button
                    onClick={() => handlePhaseChange(c.id, "pilot")}
                    className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                  >
                    パイロット版へ
                  </button>
                )}
                {c.phase === "pilot" && (
                  <>
                    <button
                      onClick={() => handleEvaluate(c.id)}
                      className="rounded bg-purple-500 px-3 py-1 text-xs text-white hover:bg-purple-600"
                    >
                      スコア算出
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "promote", "パイロット版の指標が基準を超えた")}
                      className="rounded bg-green-500 px-3 py-1 text-xs text-white hover:bg-green-600"
                    >
                      連載化
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "revise", "指標改善の余地あり")}
                      className="rounded bg-yellow-500 px-3 py-1 text-xs text-white hover:bg-yellow-600"
                    >
                      改稿
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "archive", "基準未達")}
                      className="rounded bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                    >
                      アーカイブ
                    </button>
                  </>
                )}
                {c.phase === "pilot" && c.decision === "promote" && (
                  <button
                    onClick={() => handlePhaseChange(c.id, "serial")}
                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                  >
                    連載開始
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
