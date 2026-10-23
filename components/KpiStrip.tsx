"use client";

import React from "react";
import { Briefcase, Flame, Globe2, Layers, Send, Sparkles } from "lucide-react";
import { DashboardStats } from "@/lib/types";

interface Props {
  stats: DashboardStats | null;
  activeQuickLens: string;
  onSelectLens: (lens: string) => void;
}

const KPI_CONFIG: Array<{
  id: string;
  label: string;
  value: (stats: DashboardStats) => string;
  sub: (stats: DashboardStats) => string;
  icon: React.ElementType;
  iconColor: string;
  iconSurface: string;
}> = [
  {
    id: "all",
    label: "Tracked startups",
    value: (s) => s.totalCompanies.toLocaleString(),
    sub: () => "Unique companies",
    icon: Layers,
    iconColor: "text-slate-700 dark:text-slate-200",
    iconSurface: "bg-slate-100 dark:bg-slate-800",
  },
  {
    id: "funded12mo",
    label: "Funded in 12 months",
    value: (s) => s.fundedLast12Mo.toLocaleString(),
    sub: () => "Recent rounds + seed",
    icon: Sparkles,
    iconColor: "text-lime-700 dark:text-lime-300",
    iconSurface: "bg-lime-100 dark:bg-lime-900/30",
  },
  {
    id: "hiring",
    label: "Hiring now",
    value: (s) => s.hiringNow.toLocaleString(),
    sub: (s) => `${s.totalOpenRoles.toLocaleString()} open roles`,
    icon: Briefcase,
    iconColor: "text-cyan-700 dark:text-cyan-300",
    iconSurface: "bg-cyan-100 dark:bg-cyan-900/30",
  },
  {
    id: "remote",
    label: "Remote friendly",
    value: (s) => s.remoteCompanies.toLocaleString(),
    sub: () => "Remote teams",
    icon: Globe2,
    iconColor: "text-cyan-700 dark:text-cyan-300",
    iconSurface: "bg-cyan-100 dark:bg-cyan-900/30",
  },
  {
    id: "hot",
    label: "Strong fit",
    value: (s) => s.hotLeadsCount.toLocaleString(),
    sub: () => "Score 80 or higher",
    icon: Flame,
    iconColor: "text-pink-700 dark:text-pink-300",
    iconSurface: "bg-pink-100 dark:bg-pink-900/30",
  },
  {
    id: "pipeline",
    label: "Outreach pipeline",
    value: (s) => {
      const inProgress = (s.pipelineCounts.pitched || 0) +
        (s.pipelineCounts.demo_sent || 0) +
        (s.pipelineCounts.replied || 0);
      return `${inProgress} / ${s.pipelineCounts.saved || 0}`;
    },
    sub: (s) => (s.followUpDueCount || 0) > 0
      ? `${s.followUpDueCount} follow-up due`
      : "Contacted / saved",
    icon: Send,
    iconColor: "text-lime-700 dark:text-lime-300",
    iconSurface: "bg-lime-100 dark:bg-lime-900/30",
  },
];

export function KpiStrip({ stats, activeQuickLens, onSelectLens }: Props) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Pipeline overview">
      {KPI_CONFIG.map((metric) => {
        const Icon = metric.icon;
        const active = activeQuickLens === metric.id;
        const value = stats ? metric.value(stats) : "...";
        const sub = stats ? metric.sub(stats) : "Loading";
        return (
          <button
            key={metric.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectLens(metric.id)}
            className={`group min-w-0 rounded-xl border p-3.5 text-left transition-all duration-200 sm:p-4 ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                : "border-[var(--border-soft)] bg-[var(--surface-card)] hover:-translate-y-0.5 hover:border-[var(--accent)]/45 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[10px] font-semibold uppercase leading-snug tracking-[0.08em] text-[var(--text-muted)]">
                {metric.label}
              </span>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${metric.iconSurface} ${metric.iconColor}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 truncate text-xl font-semibold tracking-tight text-[var(--text-warm)] sm:text-2xl">
              {value}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
              {sub}
            </div>
          </button>
        );
      })}
    </section>
  );
}
