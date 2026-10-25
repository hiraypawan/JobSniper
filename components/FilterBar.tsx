"use client";

import React, { useEffect, useRef } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { DashboardStats } from "@/lib/types";

export interface FilterState {
  funded12mo: boolean;
  fresh14d: boolean;
  indiaOnly: boolean;
  fresherOnly: boolean;
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
    { id: "applied", label: "Applied", count: stats?.pipelineCounts.applied },
  ];

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] backdrop-blur-sm p-3 sm:p-4 shadow-[0_6px_24px_-10px_rgba(42,83,59,0.08)]">
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
                    ? "bg-[var(--pastel-mintSoft)] border-[var(--pastel-mint)]/50 text-[var(--text-warm)] font-semibold"
                    : "border-transparent text-[var(--text-muted)] hover:bg-[var(--pastel-butterSoft)] hover:text-[var(--text-warm)]"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && tab.alert && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--accent-soft)] text-[var(--text-warm)]">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search startup, founder, role... (⌘K)"
            className="input-soft pl-10"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-warm)]"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Toggles + Dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 sm:pt-4 border-t border-[var(--border-soft)]">
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
            label="Recent activity 14d"
            title="Funding announced or a source-listed job posted within the last 14 days"
          />
          <ToggleChip
            active={filters.indiaOnly}
            onClick={() => onChange({ indiaOnly: !filters.indiaOnly })}
            label="India-eligible"
            title="India, Asia/APAC, worldwide, or anywhere eligibility explicitly listed by the source"
          />
          <ToggleChip
            active={filters.fresherOnly}
            onClick={() => onChange({ fresherOnly: !filters.fresherOnly })}
            label="Fresher keywords"
            title="Only roles whose source-listed title or details contain fresher, entry-level, junior, graduate, intern, trainee, or similar terms"
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

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
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
              { value: "remotive", label: "Remotive" },
              { value: "jobicy", label: "Jobicy" },
              { value: "trustmrr", label: "TrustMRR" },
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

        <div className="grid w-full grid-cols-[1fr_auto] items-end gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2 sm:ml-auto">
          <span className="hidden sm:inline text-[10px] font-mono text-[var(--text-muted)]">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-warm)] hover:bg-[var(--pastel-butterSoft)] transition-all"
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
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
        active
          ? "bg-[var(--pastel-mintSoft)] border-[var(--pastel-mint)]/50 text-[var(--text-warm)]"
          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--pastel-butterSoft)] hover:text-[var(--text-warm)]"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          active ? "bg-[var(--pastel-mint)]" : "bg-[var(--pastel-butter)]"
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
    <label className="flex w-full min-w-0 flex-col gap-1 sm:w-36">
      <span className="px-1 text-[10px] font-medium leading-tight text-[var(--text-muted)]">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={onChange}
        className="input-soft w-full appearance-none pr-8 bg-[var(--surface-input)] cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
