"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type SwipeDirection = "left" | "right";

type UseSwipeGestureOptions = {
  onSwipe: (direction: SwipeDirection) => void;
  threshold?: number;
  enabled?: boolean;
};

export function useSwipeGesture({
  onSwipe,
  threshold = 80,
  enabled = true,
}: UseSwipeGestureOptions) {
  const [offsetX, setOffsetX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"horizontal" | "vertical" | null>(null);

  const resetState = useCallback(() => {
    setOffsetX(0);
    setIsAnimating(false);
    isDragging.current = false;
    locked.current = null;
  }, []);

  // タッチ開始
  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!enabled || isAnimating) return;
    isDragging.current = true;
    startX.current = clientX;
    startY.current = clientY;
    locked.current = null;
  }, [enabled, isAnimating]);

  // タッチ移動
  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;

    const dx = clientX - startX.current;
    const dy = clientY - startY.current;

    // 最初の10pxでジェスチャー方向を判定してロック
    if (!locked.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return;
    }

    // 縦スクロールはブラウザに任せる
    if (locked.current === "vertical") return;

    setOffsetX(dx);
  }, []);

  // タッチ終了
  const handleEnd = useCallback(() => {
    if (!isDragging.current || locked.current !== "horizontal") {
      resetState();
      return;
    }

    isDragging.current = false;

    if (Math.abs(offsetX) > threshold) {
      // スワイプ成立 → カードを画面外にアニメーション
      const direction: SwipeDirection = offsetX > 0 ? "right" : "left";
      const flyTo = offsetX > 0 ? window.innerWidth : -window.innerWidth;
      setOffsetX(flyTo);
      setIsAnimating(true);

      setTimeout(() => {
        onSwipe(direction);
        resetState();
      }, 300);
    } else {
      // 閾値未満 → 元に戻す
      setOffsetX(0);
      locked.current = null;
    }
  }, [offsetX, threshold, onSwipe, resetState]);

  // キーボード対応（←→）
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimating) return;
      if (e.key === "ArrowLeft") {
        setOffsetX(-window.innerWidth);
        setIsAnimating(true);
        setTimeout(() => {
          onSwipe("left");
          resetState();
        }, 300);
      } else if (e.key === "ArrowRight") {
        setOffsetX(window.innerWidth);
        setIsAnimating(true);
        setTimeout(() => {
          onSwipe("right");
          resetState();
        }, 300);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isAnimating, onSwipe, resetState]);

  // プログラム的にスワイプをトリガー（ボタン用）
  const triggerSwipe = useCallback((direction: SwipeDirection) => {
    if (isAnimating) return;
    const flyTo = direction === "right" ? window.innerWidth : -window.innerWidth;
    setOffsetX(flyTo);
    setIsAnimating(true);
    setTimeout(() => {
      onSwipe(direction);
      resetState();
    }, 300);
  }, [isAnimating, onSwipe, resetState]);

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: () => handleEnd(),
    onMouseDown: (e: React.MouseEvent) => handleStart(e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => { if (isDragging.current) handleMove(e.clientX, e.clientY); },
    onMouseUp: () => handleEnd(),
    onMouseLeave: () => { if (isDragging.current) handleEnd(); },
  };

  // 回転角度（ドラッグの勢いに応じて傾く）
  const rotation = offsetX * 0.05;
  // 方向に応じたオーバーレイの透明度（0〜1）
  const overlayOpacity = Math.min(Math.abs(offsetX) / threshold, 1) * 0.4;

  return {
    offsetX,
    rotation,
    overlayOpacity,
    isAnimating,
    isDragging: isDragging.current && locked.current === "horizontal",
    handlers,
    triggerSwipe,
  };
}
