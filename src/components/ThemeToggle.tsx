"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

// Reads the theme the inline script already resolved, so the button label is
// correct on first paint rather than flickering after hydration.
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vm-theme", next);
    } catch {
      // Private browsing can refuse storage; the theme still applies for the
      // session, it just won't be remembered.
    }
    setTheme(next);
  }

  return (
    <button
      className="ghost icon-button"
      onClick={toggle}
      aria-label={
        mounted
          ? `Switch to ${theme === "dark" ? "light" : "dark"} theme`
          : "Switch theme"
      }
      title={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : undefined}
    >
      <span aria-hidden="true">{mounted && theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
