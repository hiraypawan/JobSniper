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
    <section className="rounded-3xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.7)] backdrop-blur-sm p-4 sm:p-5 space-y-4 shadow-[0_6px_24px_-10px_rgba(255,220,180,0.15)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-warm)]" style={{ fontFamily: "Quicksand, sans-serif" }}>
            Indie product launches
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]" style={{ fontFamily: "Quicksand, sans-serif" }}>
            A separate discovery feed for solo-builder products from Product Hunt, Show HN, GitHub, and TrustMRR. Dates use each platform&apos;s publication or listing time; revenue is shown only when TrustMRR explicitly reports it. TrustMRR uses its API when configured and otherwise tries a robots-permitted public-page scrape.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSources}
          className="shrink-0 rounded-xl border border-[var(--pastel-butter)]/40 px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-warm)] hover:border-[var(--pastel-peach)]/50 transition-all"
        >
          Source status
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Launch recency">
          {WINDOWS.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={window === option.value}
              onClick={() => onWindowChange(option.value)}
              className={`rounded-xl border px-3.5 py-2 text-xs transition ${
                window === option.value
                  ? "border-[var(--pastel-peach)]/60 bg-[var(--pastel-peach)]/20 font-semibold text-[var(--text-warm)] shadow-[0_4px_12px_-4px_rgba(255,220,180,0.35)]"
                  : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--pastel-butter)]/50 hover:text-[var(--text-warm)] hover:bg-[var(--pastel-butterSoft)]"
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
            className="w-44 rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.6)] px-3.5 py-2 text-xs text-[var(--text-warm)] placeholder:text-[var(--text-muted)] focus:border-[var(--pastel-peach)]/50 focus:outline-none transition-all"
          />
          <button
            type="button"
            aria-pressed={earningOnly}
            onClick={() => onEarningOnlyChange(!earningOnly)}
            className={`rounded-xl border px-3.5 py-2 text-xs transition ${
              earningOnly
                ? "border-[var(--pastel-amber)]/60 bg-[var(--pastel-amber)]/20 font-semibold text-[var(--text-warm)] shadow-[0_4px_12px_-4px_rgba(255,200,150,0.35)]"
                : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--pastel-butter)]/50 hover:text-[var(--text-warm)] hover:bg-[var(--pastel-butterSoft)]"
            }`}
            title="Keeps products with positive TrustMRR MRR, last-30-day receipts, or lifetime revenue"
          >
            Revenue evidence only
          </button>
          <span className="text-xs text-[var(--text-muted)]" aria-live="polite">
            {total.toLocaleString()} products
          </span>
        </div>
      </div>
    </section>
  );
}
