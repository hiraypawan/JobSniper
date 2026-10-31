"use client";

import React from "react";
import { Crosshair, Database, Download, Moon, RefreshCw, Sparkles, Sun, Zap } from "lucide-react";
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
  if (!iso || Number.isNaN(Date.parse(iso))) return "Not yet synced";
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function HeaderBar({ stats, syncing, syncStatusText, darkMode, onToggleDarkMode, onSyncLive, onOpenSources, onOpenPitchSettings, onExportCsv }: Props) {
  const actionClass = "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-soft)] px-3 py-2.5 text-xs font-semibold text-[var(--text-warm)] hover:bg-[var(--pastel-butterSoft)] transition-colors";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-soft)] bg-[var(--surface-header)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--pastel-peach)]">
            <Crosshair aria-hidden="true" className="h-5 w-5 text-[var(--text-warm)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-[var(--text-warm)]">JobSniper</h1>
            <p className="text-xs text-[var(--text-muted)]">Discover jobs and research companies · Updated {formatTimeAgo(stats?.lastSyncedAt ?? null)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Dashboard actions">
          <button type="button" disabled={syncing} onClick={() => onSyncLive(false)} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50" title="Refresh public feeds using the normal cache">
            <Zap aria-hidden="true" className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing..." : "Sync Live"}
          </button>
          <button type="button" disabled={syncing} onClick={() => onSyncLive(true)} className={`${actionClass} disabled:opacity-50`} title="Force an uncached refresh of public feeds">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Force
          </button>
          <button type="button" onClick={onOpenSources} className={actionClass} aria-label="Open data source status"><Database aria-hidden="true" className="h-4 w-4" />Sources</button>
          <button type="button" onClick={onOpenPitchSettings} className={actionClass} aria-label="Open pitch settings"><Sparkles aria-hidden="true" className="h-4 w-4" />Pitch settings</button>
          <button type="button" onClick={onExportCsv} className={actionClass} aria-label="Export leads as CSV"><Download aria-hidden="true" className="h-4 w-4" />CSV</button>
          <button type="button" onClick={onToggleDarkMode} className={actionClass} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={darkMode} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {darkMode ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}<span className="sr-only">{darkMode ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </div>
      {syncStatusText && (
        <div role="status" className="border-t border-[var(--border-soft)] bg-[var(--pastel-mintSoft)] px-4 py-2 text-xs text-[var(--text-warm)] sm:px-6">
          <div className="mx-auto flex max-w-[1440px] items-start gap-2"><RefreshCw aria-hidden="true" className={`h-3 w-3 shrink-0 ${syncing ? "animate-spin" : ""}`} /><span className="break-words">{syncStatusText}</span></div>
        </div>
      )}
    </header>
  );
}
