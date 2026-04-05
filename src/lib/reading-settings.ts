"use client";

// 読書設定（フォントサイズ・テーマ）のローカル管理

const STORAGE_KEY = "ainaro_reading_settings";

export type ReadingTheme = "light" | "dark" | "sepia";

export type ReadingSettings = {
  fontSize: number;  // px
  theme: ReadingTheme;
};

const DEFAULTS: ReadingSettings = {
  fontSize: 16,
  theme: "light",
};

export function getReadingSettings(): ReadingSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveReadingSettings(settings: ReadingSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const THEME_STYLES: Record<ReadingTheme, { bg: string; text: string; label: string }> = {
  light: { bg: "bg-white", text: "text-gray-900", label: "白" },
  dark: { bg: "bg-[#1a1a2e]", text: "text-gray-200", label: "暗" },
  sepia: { bg: "bg-[#f4ecd8]", text: "text-[#5b4636]", label: "紙" },
};

export const FONT_SIZES = [14, 16, 18, 20, 22] as const;
