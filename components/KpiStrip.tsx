"use client";

import React from "react";
import {
  Briefcase,
  Flame,
  Globe2,
  Layers,
  Send,
  Sparkles,
} from "lucide-react";
import { DashboardStats } from "@/lib/types";

interface Props {
  stats: DashboardStats | null;
  activeQuickLens: string;
  onSelectLens: (lens: string) => void;
}

export function KpiStrip({ stats, activeQuickLens, onSelectLens }: Props) {
  const pitchedTotal =
    (stats?.pipelineCounts.pitched || 0) +
    (stats?.pipelineCounts.demo_sent || 0) +
    (stats?.pipelineCounts.replied || 0);

  const cards = [
    {
      id: "all",
      label: "Tracked Startups",
      value: stats ? stats.totalCompanies.toLocaleString() : "—",
      sub: "Deduplicated by domain",
      icon: Layers,
      accent: "text-slate-600 dark:text-slate-300",
    },
    {
      id: "funded12mo",
      label: "Funded < 12 Months",
      value: stats ? stats.fundedLast12Mo.toLocaleString() : "—",
      sub: "W25–F26 + Seed rounds",
      icon: Sparkles,
      accent: "text-amber-500",
    },
    {
      id: "hiring",
      label: "Hiring Right Now",
      value: stats ? stats.hiringNow.toLocaleString() : "—",
      sub: stats
        ? `${stats.totalOpenRoles.toLocaleString()} open roles`
        : "ATS + WAAS verified",
      icon: Briefcase,
      accent: "text-emerald-500",
    },
    {
      id: "remote",
      label: "Remote Friendly",
      value: stats ? stats.remoteCompanies.toLocaleString() : "—",
      sub: "Async build friendly",
      icon: Globe2,
      accent: "text-sky-500",
    },
    {
      id: "hot",
      label: "Hot 5d Build Fit",
      value: stats ? stats.hotLeadsCount.toLocaleString() : "—",
      sub: "Sniper Score 80+",
      icon: Flame,
      accent: "text-orange-500",
    },
    {
      id: "pipeline",
      label: "Outreach Pipeline",
      value: stats
        ? `${pitchedTotal} pitched · ${stats.pipelineCounts.saved || 0} saved`
        : "—",
      sub:
        (stats?.followUpDueCount || 0) > 0
          ? `${stats!.followUpDueCount} follow-up due!`
          : "Click Copy Pitch to track",
      icon: Send,
      accent: "text-violet-500",
    },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
      {cards.map((c) => {
        const Icon = c.icon;
        const active = activeQuickLens === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectLens(c.id)}
            className={`text-left p-3.5 rounded-2xl border transition-all ${
              active
                ? "border-emerald-500 bg-emerald-500/8 dark:bg-emerald-500/10 shadow-xs"
                : "border-slate-200/80 dark:border-slate-800/90 bg-white dark:bg-obsidian-900 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {c.label}
              </span>
              <Icon className={`w-3.5 h-3.5 ${c.accent}`} />
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {c.value}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {c.sub}
            </div>
          </button>
        );
      })}
    </section>
  );
}
