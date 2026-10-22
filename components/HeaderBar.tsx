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
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-obsidian-800/60 bg-white/90 dark:bg-obsidian-950/80 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                StartupSniper
              </h1>
              {stats && (
                <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-obsidian-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-obsidian-800">
                  {stats.totalCompanies.toLocaleString()} startups
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              Fresh funded under 12 months &middot; Remote &amp; verified ATS hiring &middot; Updated{" "}
              <span className="font-mono text-slate-400">
                {formatTimeAgo(stats?.lastSyncedAt ?? null)}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl shadow-sm">
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-l-2xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:pointer-events-none transition-all"
              title="Sync live feeds on demand"
            >
              <Zap className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Live"}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(true)}
              className="inline-flex items-center gap-1 px-3 py-2.5 rounded-r-2xl text-xs font-mono font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:pointer-events-none border-l border-emerald-700/40 transition-all"
              title="Force uncached upstream fetch"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              Force
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSources}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">6 Sources</span>
          </button>

          <button
            type="button"
            onClick={onOpenPitchSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-500" />
            <span className="hidden sm:inline">My 5d Offer</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden md:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2.5 rounded-2xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
            aria-label="Toggle theme"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {syncStatusText && (
        <div className="bg-emerald-500/10 border-t border-emerald-500/20 px-4 sm:px-6 py-1.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs font-mono text-emerald-400 dark:text-emerald-300">
            <span className="flex items-center gap-2">
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncStatusText}
            </span>
            <span className="hidden sm:inline text-[10px] opacity-70">
              Cloudflare Worker · 0 Cron
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
