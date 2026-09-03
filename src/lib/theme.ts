/**
 * Theme preference. "system" follows `prefers-color-scheme`; "light" and "dark"
 * force a palette by putting `.light` / `.dark` on <html> (see globals.css).
 */
export const THEME_STORAGE_KEY = "fitsss-theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** Reads the stored preference. Safe to call before hydration; returns the default on the server. */
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode / storage disabled: the preference just won't persist.
  }
}

/** Puts the preference on <html>. Mirrors `themeNoFlashScript` exactly. */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (preference === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else if (preference === "light") {
    root.classList.add("light");
    root.style.colorScheme = "light";
  } else {
    root.style.colorScheme = "light dark";
  }
}

/**
 * Inline <head> script that applies the stored preference before first paint.
 * Kept as a string (not a module) so it runs synchronously with no network hop.
 */
export const themeNoFlashScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var e=document.documentElement;e.classList.remove("dark","light");if(p==="dark"){e.classList.add("dark");e.style.colorScheme="dark";}else if(p==="light"){e.classList.add("light");e.style.colorScheme="light";}else{e.style.colorScheme="light dark";}}catch(e){}})();`;
