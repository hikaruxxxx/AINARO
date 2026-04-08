"use client";

/**
 * 執筆エディタのモード切替トグル
 * デフォルトは「通常」（自分の手で書く）
 * 「AI支援」はオプション。クリックで右パネルにAIツールが出現する想定
 */
type Props = {
  aiMode: boolean;
  onChange: (next: boolean) => void;
};

export function EditorModeToggle({ aiMode, onChange }: Props) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition ${
          !aiMode
            ? "bg-gray-900 text-white"
            : "text-gray-600 hover:text-gray-900"
        }`}
        aria-pressed={!aiMode}
      >
        <span aria-hidden>✏️</span>
        通常
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition ${
          aiMode
            ? "bg-indigo-600 text-white"
            : "text-gray-600 hover:text-gray-900"
        }`}
        aria-pressed={aiMode}
      >
        <span aria-hidden>✨</span>
        AI支援
      </button>
    </div>
  );
}
