"use client";

export type WorkspaceTheme = "dark" | "light";

export const WORKSPACE_THEME_STORAGE_KEY = "pulsestudio-theme";

const themeListeners = new Set<() => void>();

export function subscribeToWorkspaceTheme(listener: () => void) {
  themeListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    themeListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

export function getWorkspaceThemeSnapshot(): WorkspaceTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export function getWorkspaceThemeServerSnapshot(): WorkspaceTheme {
  return "dark";
}

export function saveWorkspaceTheme(theme: WorkspaceTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
  themeListeners.forEach((listener) => listener());
}

export function toggleWorkspaceTheme(current: WorkspaceTheme): WorkspaceTheme {
  const next = current === "dark" ? "light" : "dark";
  saveWorkspaceTheme(next);
  return next;
}
