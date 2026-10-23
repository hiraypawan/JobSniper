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
  variant: "lime" | "cyan" | "pink" | "slate";
}> = [
  {
    id: "all",
    label: "Tracked Startups",
    value: (s) => s.totalCompanies.toLocaleString(),
    sub: () => "Deduplicated by domain",
    icon: Layers,
    variant: "slate",
  },
  {
    id: "funded12mo",
    label: "Funded < 12 Months",
    value: (s) => s.fundedLast12Mo.toLocaleString(),
    sub: () => "W25-F26 + Seed rounds",
    icon: Sparkles,
    variant: "lime",
  },
  {
    id: "hiring",
    label: "Hiring Right Now",
    value: (s) => s.hiringNow.toLocaleString(),
    sub: (s) => `${s.totalOpenRoles.toLocaleString()} open roles`,
    icon: Briefcase,
    variant: "cyan",
  },
  {
    id: "remote",
    label: "Remote Friendly",
    value: (s) => s.remoteCompanies.toLocaleString(),
    sub: () => "Async build friendly",
    icon: Globe2,
    variant: "cyan",
  },
  {
    id: "hot",
    label: "Hot Build Fit",
    value: (s) => s.hotLeadsCount.toLocaleString(),
    sub: () => "Score 80+",
    icon: Flame,
    variant: "pink",
  },
  {
    id: "pipeline",
    label: "Outreach Pipeline",
    value: (s) => {
      const pitchedTotal =
        (s.pipelineCounts.pitched || 0) +
        (s.pipelineCounts.demo_sent || 0) +
        (s.pipelineCounts.replied || 0);
      return `${pitchedTotal} / ${s.pipelineCounts.saved || 0}`;
    },
    sub: (s) =>
      (s.followUpDueCount || 0) > 0
        ? `${s.followUpDueCount} follow-up due`
        : "Pitched / saved",
    icon: Send,
    variant: "slate",
  },
];

const VARIANT_CLASSES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  lime: {
    bg: "bg-[var(--pastel-mintSoft)]",
    border: "border-[var(--pastel-mint)]/40",
    text: "text-[var(--text-warm)]",
    icon: "text-[var(--pastel-mint)]",
  },
  cyan: {
    bg: "bg-[var(--pastel-cyan)]/20",
    border: "border-[var(--pastel-cyan)]/30",
    text: "text-[var(--text-warm)]",
    icon: "text-[var(--pastel-cyan)]",
  },
  pink: {
    bg: "bg-[var(--pastel-pink)]/20",
    border: "border-[var(--pastel-pink)]/30",
    text: "text-[var(--text-warm)]",
    icon: "text-[var(--pastel-pink)]",
  },
  slate: {
    bg: "bg-[var(--pastel-butterSoft)]",
    border: "border-[var(--pastel-butter)]/40",
    text: "text-[var(--text-warm)]",
    icon: "text-[var(--pastel-amber)]",
  },
};

export function KpiStrip({ stats, activeQuickLens, onSelectLens }: Props) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {KPI_CONFIG.map((c) => {
        const Icon = c.icon;
        const variant = VARIANT_CLASSES[c.variant];
        const active = activeQuickLens === c.id;
        const value = stats ? c.value(stats) : (c.id === "all" ? "-" : "-");
        const sub = stats ? c.sub(stats) : "";
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectLens(c.id)}
            className={`text-left p-4 rounded-3xl border transition-all duration-300 ${
              active
                ? `${variant.border.replace("/40", "/60")} ${variant.bg.replace("Soft", "Soft")} shadow-[0_6px_20px_-8px_rgba(255,220,180,0.35)]`
                : `${variant.border} ${variant.bg} hover:border-[var(--pastel-peach)]/50 hover:bg-[var(--pastel-butterSoft)]`
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {c.label}
                </span>
                <Icon className={`w-4 h-4 ${variant.icon}`} />
              </div>
            </div>
            <div className="mt-2">
              <div className={`text-base sm:text-lg font-mono font-bold ${variant.text} whitespace-nowrap`}>
                {value}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                {sub}
              </div>
            </div>
          </button>
        );
      })}
    </section>
  );
}
