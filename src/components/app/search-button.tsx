"use client";
import { Search } from "lucide-react";
import { openSearch } from "./command-palette";

export function SearchButton() {
  return (
    <>
      <button type="button" onClick={openSearch} className="hidden h-10 w-full max-w-[280px] items-center gap-2 rounded-md border border-line bg-card px-3 text-sm text-fg-3 hover:border-line-hover sm:flex">
        <Search size={16} aria-hidden />
        <span className="flex-1 text-left">Search trades, plans, pages</span>
        <kbd className="rounded border border-line px-1.5 text-[11px]">⌘K</kbd>
      </button>
      <button type="button" onClick={openSearch} aria-label="Search" className="flex size-10 items-center justify-center rounded-md text-fg-2 hover:bg-subtle sm:hidden">
        <Search size={18} aria-hidden />
      </button>
    </>
  );
}
