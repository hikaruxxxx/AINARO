"use client";

// 横スクロール棚（デスクトップでは左右矢印を表示）
// モバイルではスワイプで自然に操作できるが、PCマウスユーザーは
// 横スクロールの存在に気づきにくいため矢印で誘導する。

import { useRef, useState, useEffect, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function ScrollShelf({ children }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // スクロール位置に応じて矢印の有効/無効を更新
  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  // 1画面分スクロール
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="group relative">
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
      >
        {children}
      </div>

      {/* 左矢印（hoverかつスクロール可能なときのみ表示） */}
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="前へ"
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg ring-1 ring-black/5 transition hover:bg-white md:flex md:h-10 md:w-10 opacity-0 group-hover:opacity-100"
        >
          <span className="text-lg text-gray-700">‹</span>
        </button>
      )}

      {/* 右矢印 */}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="次へ"
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg ring-1 ring-black/5 transition hover:bg-white md:flex md:h-10 md:w-10 opacity-0 group-hover:opacity-100"
        >
          <span className="text-lg text-gray-700">›</span>
        </button>
      )}
    </div>
  );
}
