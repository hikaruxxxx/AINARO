"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContentCandidate, ContentCandidatePhase } from "@/types/novel";

const PHASE_LABELS: Record<ContentCandidatePhase, string> = {
  plot: "プロット",
  pilot: "パイロット版",
  serial: "連載中",
  archived: "アーカイブ",
};

const PHASE_DOT_COLORS: Record<ContentCandidatePhase, string> = {
  plot: "bg-yellow-500",
  pilot: "bg-blue-500",
  serial: "bg-green-500",
  archived: "bg-gray-400",
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
    return <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">コンテンツ選別ファネル</h2>
        <p className="text-sm text-gray-500">プロットからの進行状況を管理</p>
      </div>

      {/* ファネルサマリー */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {(Object.entries(PHASE_LABELS) as [ContentCandidatePhase, string][]).map(([phase, label]) => (
          <button
            key={phase}
            onClick={() => setFilter(filter === phase ? "" : phase)}
            className={`rounded-xl border bg-white p-4 text-center shadow-sm transition ${
              filter === phase ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{summary[phase]}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </button>
        ))}
      </div>

      {/* 候補一覧 */}
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">候補がありません</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900">{c.title}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${PHASE_DOT_COLORS[c.phase]}`} />
                      <span className="text-xs font-medium text-gray-600">
                        {PHASE_LABELS[c.phase]}
                      </span>
                    </div>
                    {c.decision && (
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          c.decision === "promote" ? "bg-green-500"
                            : c.decision === "revise" ? "bg-yellow-500"
                              : "bg-red-500"
                        }`} />
                        <span className="text-xs font-medium text-gray-600">
                          {c.decision === "promote" ? "連載化" : c.decision === "revise" ? "改稿" : "アーカイブ"}
                        </span>
                      </div>
                    )}
                  </div>
                  {c.synopsis && <p className="text-sm text-gray-500 line-clamp-2">{c.synopsis}</p>}
                  <div className="mt-1 flex gap-2 text-xs text-gray-400">
                    <span>{c.genre}</span>
                    {c.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>

                {/* パイロットスコア */}
                {c.pilot_score !== null && (
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-blue-600">{c.pilot_score.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">パイロットスコア</p>
                  </div>
                )}
              </div>

              {/* パイロット指標 */}
              {c.pilot_completion_rate !== null && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="font-bold text-gray-900">{(c.pilot_completion_rate * 100).toFixed(1)}%</p>
                    <p className="text-gray-400">読了率</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="font-bold text-gray-900">{c.pilot_next_rate !== null ? `${(c.pilot_next_rate * 100).toFixed(1)}%` : "-"}</p>
                    <p className="text-gray-400">次話遷移率</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="font-bold text-gray-900">{c.pilot_bookmark_rate !== null ? `${(c.pilot_bookmark_rate * 100).toFixed(1)}%` : "-"}</p>
                    <p className="text-gray-400">BM率</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="font-bold text-gray-900">{c.pilot_avg_read_sec !== null ? `${Math.round(c.pilot_avg_read_sec)}秒` : "-"}</p>
                    <p className="text-gray-400">平均滞在</p>
                  </div>
                </div>
              )}

              {/* アクションボタン */}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.phase === "plot" && (
                  <button
                    onClick={() => handlePhaseChange(c.id, "pilot")}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 transition"
                  >
                    パイロット版へ
                  </button>
                )}
                {c.phase === "pilot" && (
                  <>
                    <button
                      onClick={() => handleEvaluate(c.id)}
                      className="rounded-lg bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 transition"
                    >
                      スコア算出
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "promote", "パイロット版の指標が基準を超えた")}
                      className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 transition"
                    >
                      連載化
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "revise", "指標改善の余地あり")}
                      className="rounded-lg bg-yellow-500 px-3 py-1 text-xs text-white hover:bg-yellow-600 transition"
                    >
                      改稿
                    </button>
                    <button
                      onClick={() => handleDecision(c.id, "archive", "基準未達")}
                      className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 transition"
                    >
                      アーカイブ
                    </button>
                  </>
                )}
                {c.phase === "pilot" && c.decision === "promote" && (
                  <button
                    onClick={() => handlePhaseChange(c.id, "serial")}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 transition"
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
