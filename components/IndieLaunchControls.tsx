"use client";

import React from "react";

export type LaunchWindow = "1d" | "7d" | "30d" | "365d";

interface Props {
  window: LaunchWindow;
  earningOnly: boolean;
  total: number;
  search: string;
  onSearchChange: (search: string) => void;
  onWindowChange: (window: LaunchWindow) => void;
  onEarningOnlyChange: (value: boolean) => void;
  onOpenSources: () => void;
}

const WINDOWS: Array<{ value: LaunchWindow; label: string }> = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "1 week" },
  { value: "30d", label: "1 month" },
  { value: "365d", label: "1 year" },
];

export function IndieLaunchControls({
  window,
  earningOnly,
  total,
  search,
  onSearchChange,
  onWindowChange,
  onEarningOnlyChange,
  onOpenSources,
}: Props) {
  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Indie product launches</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            A separate discovery feed for solo-builder products from Product Hunt, Show HN, GitHub, and TrustMRR. Dates use each platform’s publication or listing time; revenue is shown only when TrustMRR explicitly reports it.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSources}
          className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-medium text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
        >
          Source status
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Launch recency">
          {WINDOWS.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={window === option.value}
              onClick={() => onWindowChange(option.value)}
              className={`rounded-xl border px-3.5 py-2 text-xs transition ${
                window === option.value
                  ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300"
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search launches"
            aria-label="Search indie launches"
            className="w-44 rounded-xl border border-white/10 bg-obsidian-950/60 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
          <button
            type="button"
            aria-pressed={earningOnly}
            onClick={() => onEarningOnlyChange(!earningOnly)}
            className={`rounded-xl border px-3.5 py-2 text-xs transition ${
              earningOnly
                ? "border-amber-500/40 bg-amber-500/10 font-semibold text-amber-300"
                : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
            }`}
            title="Keeps products with positive TrustMRR MRR, last-30-day receipts, or lifetime revenue"
          >
            Revenue evidence only
          </button>
          <span className="text-xs text-slate-500" aria-live="polite">
            {total.toLocaleString()} products
          </span>
        </div>
      </div>
    </section>
  );
}
