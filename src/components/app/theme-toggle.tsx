"use client";
import { Moon, Sun } from "lucide-react";
import { applyTheme, useTheme } from "@/lib/theme";

/** Light / Dark segmented switch from the Figma sidebar. Saved per device. */
export function ThemeToggle() {
  const theme = useTheme();

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-1 rounded-[12px] bg-nav-active p-1">
      {(["light", "dark"] as const).map((t) => (
        <button key={t} role="radio" aria-checked={theme === t} onClick={() => applyTheme(t)}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-[13px] capitalize transition-colors ${theme === t ? "bg-[#3a3a36] text-white" : "text-nav-muted hover:text-nav-fg"}`}>
          {t === "light" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}{t}
        </button>
      ))}
    </div>
  );
}
