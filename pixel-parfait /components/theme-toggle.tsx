"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "pixel-parfait-theme";
const THEME_EVENT = "pixel-parfait-theme-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getSnapshot(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light");

  function applyTheme(nextTheme: Theme) {
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div className="glass-card inline-flex items-center gap-1 rounded-full p-1">
      <button
        className={`rounded-full px-3 py-1.5 text-sm transition ${
          theme === "light" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)]"
        }`}
        type="button"
        onClick={() => applyTheme("light")}
        aria-pressed={theme === "light"}
      >
        Light
      </button>
      <button
        className={`rounded-full px-3 py-1.5 text-sm transition ${
          theme === "dark" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)]"
        }`}
        type="button"
        onClick={() => applyTheme("dark")}
        aria-pressed={theme === "dark"}
      >
        Dark
      </button>
    </div>
  );
}
