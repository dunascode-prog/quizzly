"use client";

import { Icon } from "./Icon";

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  return (
    <button type="button" className={className} onClick={toggle} aria-label="Switch between light and dark mode">
      <Icon name="moon" size={20} className="when-light" />
      <Icon name="sun" size={20} className="when-dark" />
    </button>
  );
}
