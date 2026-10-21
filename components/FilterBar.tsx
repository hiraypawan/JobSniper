"use client";

import React, { useEffect, useRef } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { DashboardStats } from "@/lib/types";

export interface FilterState {
  funded12mo: boolean;
  fresh14d: boolean;
  remote: boolean;
  hiring: boolean;
  smallTeam: boolean;
  source: string;
  batch: string;
  ats: string;
  pipeline: string;
  sort: string;
  search: string;
}

interface Props {
  filters: FilterState;
  stats: DashboardStats | null;
  totalResults: number;
  onChange: (next: Partial<FilterState>) => void;
  onReset: () => void;
}

export function FilterBar({
  filters,
  stats,
  totalResults,
  onChange,
  onReset,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pipelineTabs = [
    { id: "all", label: "All Leads", count: stats?.totalCompanies },
    { id: "new", label: "Inbox", count: stats?.pipelineCounts.new },
    { id: "saved", label: "★ Saved", count: stats?.pipelineCounts.saved },
    { id: "pitched", label: "Pitched", count: stats?.pipelineCounts.pitched },
    {
      id: "followup_due",
      label: "Follow-up Due",
      count: stats?.followUpDueCount,
      alert: (stats?.followUpDueCount || 0) > 0,
    },
    { id: "replied", label: "Replied", count: stats?.pipelineCounts.replied },
  ];

  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/90 bg-white dark:bg-obsidian-900 p-3.5 space-y-3 shadow-xs">
      {/* Row 1: Pipeline CRM Tabs + Instant Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
          {pipelineTabs.map((tab) => {
            const active = filters.pipeline === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange({ pipeline: tab.id })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800"
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
                      tab.alert
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : active
                          ? "bg-white/20 dark:bg-slate-900/15"
                          : "bg-slate-200/70 dark:bg-obsidian-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search startup, AI agent, founder, role... (⌘K)"
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Toggles + Dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip
            active={filters.funded12mo}
            onClick={() => onChange({ funded12mo: !filters.funded12mo })}
            label="Funded < 12mo"
          />
          <ToggleChip
            active={filters.fresh14d}
            onClick={() =>
              onChange({
                fresh14d: !filters.fresh14d,
                sort: !filters.fresh14d ? "newest" : filters.sort,
              })
            }
            label="Fresh 14d"
          />
          <ToggleChip
            active={filters.remote}
            onClick={() => onChange({ remote: !filters.remote })}
            label="Remote Only"
          />
          <ToggleChip
            active={filters.hiring}
            onClick={() => onChange({ hiring: !filters.hiring })}
            label="Hiring Only"
          />
          <ToggleChip
            active={filters.smallTeam}
            onClick={() => onChange({ smallTeam: !filters.smallTeam })}
            label="Small Team ≤ 15"
          />

          <select
            aria-label="Filter by source"
            value={filters.source}
            onChange={(e) => onChange({ source: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">Source: All</option>
            <option value="yc">Y Combinator</option>
            <option value="workatastartup">Work at a Startup</option>
            <option value="wellfound">Wellfound &amp; Seed</option>
            <option value="producthunt">Product Hunt</option>
            <option value="indie">Indie / Show HN</option>
            <option value="hn_hiring">HN Who is Hiring</option>
          </select>

          <select
            aria-label="Filter by batch"
            value={filters.batch}
            onChange={(e) => onChange({ batch: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">Batch: All</option>
            <option value="F26">YC F26 (Fall 2026)</option>
            <option value="S26">YC S26 (Summer 2026)</option>
            <option value="X26">YC X26 (Spring 2026)</option>
            <option value="W26">YC W26 (Winter 2026)</option>
            <option value="F25">YC F25 (Fall 2025)</option>
            <option value="S25">YC S25 (Summer 2025)</option>
            <option value="X25">YC X25 (Spring 2025)</option>
            <option value="W25">YC W25 (Winter 2025)</option>
          </select>

          <select
            aria-label="Filter by ATS provider"
            value={filters.ats}
            onChange={(e) => onChange({ ats: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">ATS: Any</option>
            <option value="ashby">Ashby</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workable">Workable</option>
            <option value="yc">YC WAAS</option>
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hidden sm:inline">
            {totalResults.toLocaleString()} matches
          </span>

          <select
            aria-label="Sort companies"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="score">Sort: Best Sniper Fit</option>
            <option value="newest">Sort: Newest Funded First</option>
            <option value="roles">Sort: Most Open Roles</option>
            <option value="smallest_team">Sort: Smallest Team First</option>
          </select>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
            title="Reset all filters to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
        active
          ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 font-semibold"
          : "border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-obsidian-850 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
        }`}
      />
      {label}
    </button>
  );
}
