"use client";

// テイストプロファイル管理
// 初回訪問時のジャンル選択 + 読書履歴からの自動学習

const STORAGE_KEY = "ainaro_taste_profile";
const ONBOARDING_KEY = "ainaro_onboarding_done";

export type TasteProfile = {
  preferredGenres: string[];
  updatedAt: string;
};

export function getTasteProfile(): TasteProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTasteProfile(genres: string[]) {
  if (typeof window === "undefined") return;
  const profile: TasteProfile = {
    preferredGenres: genres,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  localStorage.setItem(ONBOARDING_KEY, "true");
}

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function skipOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_KEY, "true");
}
