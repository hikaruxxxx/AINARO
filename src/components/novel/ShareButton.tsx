"use client";

import { useState, useCallback } from "react";

type Props = {
  title: string;
  text?: string;
  url?: string;
};

export default function ShareButton({ title, text, url }: Props) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Web Share APIが使えればネイティブシェア
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl });
        return;
      } catch {
        // ユーザーがキャンセルした場合は何もしない
      }
    }

    // フォールバック: URLをクリップボードにコピー
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard APIが使えない場合
    }
  }, [title, text, shareUrl]);

  // X（Twitter）シェア
  const handleShareX = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const params = new URLSearchParams({
      text: `${title}\n`,
      url: shareUrl,
    });
    window.open(`https://x.com/intent/tweet?${params}`, "_blank", "width=550,height=420");
  }, [title, shareUrl]);

  // LINEシェア
  const handleShareLine = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`;
    window.open(lineUrl, "_blank", "width=550,height=420");
  }, [title, shareUrl]);

  return (
    <div className="flex items-center gap-2">
      {/* メインシェアボタン */}
      <button
        onClick={handleShare}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted transition hover:text-primary hover:border-primary"
        aria-label="シェア"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span>{copied ? "コピー済み" : "シェア"}</span>
      </button>

      {/* Xシェア */}
      <button
        onClick={handleShareX}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-black hover:text-white hover:border-black"
        aria-label="Xでシェア"
        title="Xでシェア"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </button>

      {/* LINEシェア */}
      <button
        onClick={handleShareLine}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-[#06C755] hover:text-white hover:border-[#06C755]"
        aria-label="LINEでシェア"
        title="LINEでシェア"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
      </button>
    </div>
  );
}
