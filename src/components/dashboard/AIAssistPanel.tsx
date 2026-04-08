"use client";

/**
 * AI支援パネル（プレースホルダ）
 * モードが「AI支援」のときだけエディタ右側に出現
 * 中身は今後実装（プロット案・続き生成・校正・読了率予測 等）
 */
export function AIAssistPanel() {
  return (
    <aside className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden>✨</span>
        <h3 className="text-sm font-bold text-indigo-900">AI支援</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-indigo-800">
        AIに執筆を手伝ってもらえます。あなたの書いた文章を尊重しながら、必要な部分だけ補助します。
      </p>

      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-medium text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-60"
        >
          📝 続きの草稿を提案
          <span className="ml-1 text-[10px] text-indigo-500">(近日公開)</span>
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-medium text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-60"
        >
          🔍 文章を校正
          <span className="ml-1 text-[10px] text-indigo-500">(近日公開)</span>
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-medium text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-60"
        >
          💡 シーンのアイデアを出す
          <span className="ml-1 text-[10px] text-indigo-500">(近日公開)</span>
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-medium text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-60"
        >
          📊 読了率を予測
          <span className="ml-1 text-[10px] text-indigo-500">(近日公開)</span>
        </button>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-indigo-600">
        AI機能は順次開放予定です。要望は問い合わせフォームから。
      </p>
    </aside>
  );
}
