"use client";

import React from "react";
import { Crosshair, Download, Moon, RefreshCw, SlidersHorizontal, Sun, Zap } from "lucide-react";
import { DashboardStats } from "@/lib/types";

interface Props {
  stats: DashboardStats | null;
  syncing: boolean;
  syncStatusText: string | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSyncLive: (force: boolean) => void;
  onOpenSources: () => void;
  onOpenPitchSettings: () => void;
  onExportCsv: () => void;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Ready";
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 15) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function HeaderBar({
  stats,
  syncing,
  syncStatusText,
  darkMode,
  onToggleDarkMode,
  onSyncLive,
  onOpenSources,
  onOpenPitchSettings,
  onExportCsv,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-soft)] bg-[rgba(255,248,240,0.85)] backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[var(--pastel-peach)] flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(255,200,180,0.5)]">
            <Crosshair className="w-5 h-5 text-[var(--text-warm)]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-warm)]" style={{ fontFamily: "Quicksand, sans-serif" }}>
                StartupSniper
              </h1>
              {stats && (
                <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-[var(--text-muted)] bg-[var(--pastel-butterSoft)] border border-[var(--pastel-butter)]/40">
                  {stats.totalCompanies.toLocaleString()} startups
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Fresh funded {'<12mo'} &amp; verified ATS hiring · Updated{" "}
              <span className="font-mono text-[var(--text-muted)]">
                {formatTimeAgo(stats?.lastSyncedAt ?? null)}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl shadow-[0_4px_14px_-4px_rgba(255,220,180,0.35)]">
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-l-2xl text-xs font-semibold bg-[var(--pastel-peach)] text-[var(--text-warm)] hover:bg-[var(--pastel-butter)] disabled:opacity-50 transition-all shadow-[0_4px_12px_-4px_rgba(255,220,180,0.4)]"
              title="Sync live feeds on demand"
            >
              <Zap className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Live"}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(true)}
              className="inline-flex items-center gap-1 px-3 py-2.5 rounded-r-2xl text-xs font-mono font-semibold bg-transparent text-[var(--text-muted)] hover:bg-[var(--pastel-butterSoft)] disabled:opacity-50 border-l border-[var(--border-soft)] transition-all"
              title="Force uncached upstream fetch"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              Force
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSources}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-[var(--pastel-butter)]/40 text-[var(--text-muted)] hover:bg-[var(--pastel-butterSoft)] transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--pastel-amber)]" />
            <span className="hidden sm:inline">6 Sources</span>
          </button>

          <button
            type="button"
            onClick={onOpenPitchSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-[var(--pastel-lavender)]/40 text-[var(--text-muted)] hover:bg-[var(--pastel-lavenderSoft)] transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--pastel-pink)]" />
            <span className="hidden sm:inline">My 5d Offer</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-[var(--pastel-cyan)]/30 text-[var(--text-muted)] hover:bg-[var(--pastel-mintSoft)] transition-all"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5 text-[var(--pastel-cyan)]" />
            <span className="hidden md:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2.5 rounded-2xl border border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--pastel-butterSoft)] transition-all"
            aria-label="Toggle theme"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-[var(--pastel-amber)]" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--pastel-slate)]" />
            )}
          </button>
        </div>
      </div>

      {syncStatusText && (
        <div className="bg-[var(--pastel-mintSoft)] border-t border-[var(--pastel-mint)]/40 px-4 sm:px-6 py-1.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs font-mono text-[var(--text-warm)]">
            <span className="flex items-center gap-2">
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncStatusText}
            </span>
            <span className="hidden sm:inline text-[10px] opacity-60">
              Cloudflare Worker · 0 Cron
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
