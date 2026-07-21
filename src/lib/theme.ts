import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "pr-dashboard.theme";

// Theme-color meta values mirror the html/body background per theme.
const META_COLOR: Record<Theme, string> = {
  light: "#FFFDF5",
  dark: "#1A1A1A",
};

export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Stored choice wins; otherwise follow the OS preference. */
export function resolveInitial(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** Apply to <html> and sync color-scheme + theme-color meta. Idempotent. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", META_COLOR[theme]);
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore — apply anyway
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent<Theme>("themechange", { detail: theme }));
}

/** React hook: current theme + toggle. Subscribes to cross-component changes. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || resolveInitial(),
  );

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail) setThemeState(detail);
    };
    window.addEventListener("themechange", onChange);
    return () => window.removeEventListener("themechange", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return { theme, toggle };
}
