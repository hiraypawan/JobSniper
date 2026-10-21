"use client";

import React from "react";
import {
  Crosshair,
  Download,
  Moon,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Zap,
} from "lucide-react";
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
  if (!iso) return "Live ready";
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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-obsidian-950/90 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand + Live Pulse */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                StartupSniper
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE WORKER
              </span>
              {stats && (
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                  {stats.totalCompanies.toLocaleString()} startups
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Fresh funded (&lt;12mo) · Remote &amp; verified ATS hiring radar ·{" "}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                Updated {formatTimeAgo(stats?.lastSyncedAt ?? null)}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Split Live Sync + Force Uncached Refresh */}
          <div className="inline-flex rounded-xl shadow-xs">
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-l-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 transition"
              title="Fetch latest live startups & enrich ATS job boards on demand"
            >
              <Zap
                className={`w-3.5 h-3.5 ${syncing ? "animate-bounce" : ""}`}
              />
              {syncing ? "Syncing Live..." : "Sync Live"}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncLive(true)}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-r-xl text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white border-l border-emerald-700/40 transition"
              title="Force zero-cache upstream fetch across all 6 feeds"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              Force
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSources}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">6 Sources</span>
          </button>

          <button
            type="button"
            onClick={onOpenPitchSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-500" />
            <span className="hidden sm:inline">My 5d Offer</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
            title="Export visible startups + prefilled pitches to CSV"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden md:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
            aria-label="Toggle color theme"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>

      {/* Live Progressive Worker Sync Telemetry Strip */}
      {syncStatusText && (
        <div className="bg-emerald-500/10 border-t border-emerald-500/20 px-4 sm:px-6 py-1.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs font-mono text-emerald-700 dark:text-emerald-300">
            <span className="flex items-center gap-2">
              <RefreshCw
                className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`}
              />
              {syncStatusText}
            </span>
            <span className="hidden sm:inline text-[11px] opacity-80">
              Cloudflare Worker On-Demand Stream · 0 Cron Required
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
