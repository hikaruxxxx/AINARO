import { getTheme, setTheme, type ThemeMode } from "./lib/theme";

const SUN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
const MOON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
const MONITOR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="4" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path></svg>`;

const ICONS: Record<ThemeMode, string> = {
  light: SUN_SVG,
  dark: MOON_SVG,
  system: MONITOR_SVG,
};

const NEXT: Record<ThemeMode, ThemeMode> = {
  light: "system",
  dark: "light",
  system: "dark",
};

const TITLES: Record<ThemeMode, string> = {
  light: "ライトモード",
  dark: "ダークモード",
  system: "システム連動",
};

export function mountThemeToggle(root: HTMLElement): () => void {
  const render = (): void => {
    const cur = getTheme();
    root.innerHTML = `<button type="button" class="nc-theme-toggle nc-button nc-button--ghost nc-button--sm" title="${TITLES[cur]} (クリックで切替)" aria-label="theme: ${cur}">${ICONS[cur]}</button>`;
  };

  const handler = (): void => {
    const cur = getTheme();
    setTheme(NEXT[cur]);
    render();
  };

  render();
  root.addEventListener("click", handler);

  return () => {
    root.removeEventListener("click", handler);
    root.innerHTML = "";
  };
}
