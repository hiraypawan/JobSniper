"use client";

import React, { useEffect } from "react";
import { CheckCircle2, Clock, Database, Radio, X } from "lucide-react";
import { SyncSourceSummary } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  summaries: SyncSourceSummary[];
  bySource: Record<string, number>;
  lastSyncedAt: string | null;
}

const SOURCE_LABELS: Record<string, { name: string; desc: string }> = {
  yc: {
    name: "Y Combinator (W25 to F26)",
    desc: "Recent YC cohorts from the yc-oss JSON API",
  },
  workatastartup: {
    name: "Work at a Startup",
    desc: "YC companies that are hiring right now",
  },
  wellfound: {
    name: "Funding RSS (FinSMEs, EU-Startups, TechCrunch)",
    desc: "Funding headlines with an explicitly linked company website",
  },
  producthunt: {
    name: "Product Hunt / Launches",
    desc: "Launches from the last week that link to their own site",
  },
  indie: {
    name: "Show HN & GitHub Projects",
    desc: "Recent Show HN posts or repositories with an explicit project website",
  },
  hn_hiring: {
    name: "HN Who is Hiring?",
    desc: "The newest hiring thread, parsed for remote roles",
  },
};

export function SourceHealthPopover({
  isOpen,
  onClose,
  summaries,
  bySource,
  lastSyncedAt,
}: Props) {
  // Body scroll lock & Escape
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "contain";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overscrollBehavior = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const summaryMap = new Map(summaries.map((s) => [s.source, s]));
  const keys = Object.keys(SOURCE_LABELS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center sm:justify-end bg-black/40 backdrop-blur-[1px] p-4 sm:pt-16 sm:pr-6 overflow-y-auto overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Data sources"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-obsidian-900 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-obsidian-900">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Data sources</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition-all"
            aria-label="Close source health"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0 overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-obsidian-850 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-500" />
              Worker with a D1 cache, no cron needed
            </span>
            {lastSyncedAt && (
              <span className="font-mono flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(lastSyncedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {keys.map((key) => {
            const meta = SOURCE_LABELS[key];
            const sum = summaryMap.get(key as SyncSourceSummary["source"]);
            const dbCount = bySource[key] ?? sum?.count ?? 0;

            return (
              <div
                key={key}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/90 bg-slate-50/50 dark:bg-obsidian-850/60 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {sum?.mode === "unavailable" ? (
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                      {meta.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {sum?.note || meta.desc}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {sum?.count ?? dbCount} leads
                  </div>
                  <div className={`font-mono text-[10px] ${
                    sum?.mode === "unavailable"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {sum ? `${sum.durationMs}ms · ${sum.mode}` : "synced"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-obsidian-900">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
