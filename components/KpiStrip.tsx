"use client";

import React from "react";
import { Briefcase, Flame, Globe2, Layers, Send, Sparkles } from "lucide-react";
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
      accent: "text-slate-400",
      bg: "bg-white/5",
      border: "border-white/10",
    },
    {
      id: "funded12mo",
      label: "Funded < 12 Months",
      value: stats ? stats.fundedLast12Mo.toLocaleString() : "—",
      sub: "W25–F26 + Seed rounds",
      icon: Sparkles,
      accent: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      id: "hiring",
      label: "Hiring Right Now",
      value: stats ? stats.hiringNow.toLocaleString() : "—",
      sub: `${stats?.totalOpenRoles?.toLocaleString() ?? "—"} open roles`,
      icon: Briefcase,
      accent: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      id: "remote",
      label: "Remote Friendly",
      value: stats ? stats.remoteCompanies.toLocaleString() : "—",
      sub: "Async build friendly",
      icon: Globe2,
      accent: "text-sky-500",
      bg: "bg-sky-500/10",
      border: "border-sky-500/20",
    },
    {
      id: "hot",
      label: "Hot Build Fit",
      value: stats ? stats.hotLeadsCount.toLocaleString() : "—",
      sub: "Score 80+",
      icon: Flame,
      accent: "text-orange-500",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
    {
      id: "pipeline",
      label: "Outreach Pipeline",
      value: stats
        ? `${pitchedTotal} pitched · ${stats.pipelineCounts.saved || 0} saved`
        : "—",
      sub:
        (stats?.followUpDueCount || 0) > 0
          ? `${stats?.followUpDueCount} follow-up due`
          : "Copy pitch to track",
      icon: Send,
      accent: "text-violet-500",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
    },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        const active = activeQuickLens === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectLens(c.id)}
            className={`text-left p-4 rounded-3xl border transition-all duration-300 ${
              active
                ? `border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]`
                : `${c.border} ${c.bg} hover:border-white/20 dark:hover:border-obsidian-700 hover:bg-white/10 dark:hover:bg-obsidian-900`
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  {c.label}
                </span>
                <Icon className={`w-4 h-4 ${c.accent}`} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-lg font-mono font-bold text-slate-100 truncate">
                {c.value}
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                {c.sub}
              </div>
            </div>
          </button>
        );
      })}
    </section>
  );
}
