// Novelis Console のテーマ状態を shell と将来 view から共有するための helper。
export type ThemeMode = "light" | "dark" | "system";

const storageKey = "nc.theme";
const themeModes = new Set<ThemeMode>(["light", "dark", "system"]);

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && themeModes.has(value as ThemeMode);
}

export function getTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(storageKey);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(storageKey, mode);
  } catch {
    // localStorage が使えない環境でも表示テーマだけは更新する。
  }

  document.documentElement.dataset.theme = mode;
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") {
    return mode;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function subscribeSystem(cb: (mode: "light" | "dark") => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent): void => {
    cb(event.matches ? "dark" : "light");
  };

  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
