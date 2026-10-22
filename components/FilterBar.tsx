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
    { id: "saved", label: "Saved", count: stats?.pipelineCounts.saved },
    { id: "pitched", label: "Pitched", count: stats?.pipelineCounts.pitched },
    {
      id: "followup_due",
      label: "Follow-up",
      count: stats?.followUpDueCount,
      alert: (stats?.followUpDueCount || 0) > 0,
    },
    { id: "replied", label: "Replied", count: stats?.pipelineCounts.replied },
  ];

  return (
    <section className="rounded-3xl border border-white/10 dark:border-obsidian-800/60 bg-white/5 dark:bg-obsidian-900/80 p-3 sm:p-4 shadow-sm backdrop-blur-sm">
      {/* Row 1: Pipeline + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {pipelineTabs.map((tab) => {
            const active = filters.pipeline === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange({ pipeline: tab.id })}
                className={`whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? "bg-white/10 dark:bg-obsidian-800 text-white border-transparent font-semibold"
                    : "text-slate-400 hover:bg-white/10 dark:hover:bg-obsidian-800 hover:text-slate-200 border-transparent"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && tab.alert && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-slate-950">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search company, founder or role (Cmd K)"
            className="w-full pl-9 pr-8 py-3 rounded-2xl text-sm border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 placeholder-slate-500/60 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40 transition-all"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Toggles + Dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 sm:pt-4 border-t border-white/10 dark:border-obsidian-800/40">
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
            label="Remote"
          />
          <ToggleChip
            active={filters.hiring}
            onClick={() => onChange({ hiring: !filters.hiring })}
            label="Hiring"
          />
          <ToggleChip
            active={filters.smallTeam}
            onClick={() => onChange({ smallTeam: !filters.smallTeam })}
            label="Small Team"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SourceSelect
            label="Source"
            value={filters.source}
            onChange={(e) => onChange({ source: e.target.value })}
            options={[
              { value: "all", label: "All" },
              { value: "yc", label: "Y Combinator" },
              { value: "workatastartup", label: "WAAS" },
              { value: "wellfound", label: "Wellfound" },
              { value: "producthunt", label: "Product Hunt" },
              { value: "indie", label: "Indie / HN" },
              { value: "hn_hiring", label: "HN Hiring" },
            ]}
          />
          <SourceSelect
            label="Batch"
            value={filters.batch}
            onChange={(e) => onChange({ batch: e.target.value })}
            options={[
              { value: "all", label: "All" },
              { value: "F26", label: "F26" },
              { value: "S26", label: "S26" },
              { value: "X26", label: "X26" },
              { value: "W26", label: "W26" },
              { value: "F25", label: "F25" },
              { value: "S25", label: "S25" },
              { value: "X25", label: "X25" },
              { value: "W25", label: "W25" },
            ]}
          />
          <SourceSelect
            label="ATS"
            value={filters.ats}
            onChange={(e) => onChange({ ats: e.target.value })}
            options={[
              { value: "all", label: "Any" },
              { value: "ashby", label: "Ashby" },
              { value: "greenhouse", label: "Greenhouse" },
              { value: "lever", label: "Lever" },
              { value: "workable", label: "Workable" },
              { value: "yc", label: "YC WAAS" },
            ]}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="hidden sm:inline text-[10px] font-mono text-slate-500">
            {totalResults.toLocaleString()} matches
          </span>

          <SourceSelect
            label="Sort"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            options={[
              { value: "score", label: "Best Score" },
              { value: "newest", label: "Newest" },
              { value: "roles", label: "Most Roles" },
              { value: "smallest_team", label: "Smallest Team" },
            ]}
          />

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs text-slate-400 hover:text-white hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
            title="Reset filters"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
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
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
        active
          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold"
          : "border-transparent text-slate-500 hover:bg-white/10 dark:hover:bg-obsidian-800 hover:text-slate-300"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          active ? "bg-emerald-500" : "bg-slate-700"
        }`}
      />
      {label}
    </button>
  );
}

function SourceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={onChange}
      className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40 transition-all appearance-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
