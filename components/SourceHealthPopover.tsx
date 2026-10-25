"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Clock, Database, X } from "lucide-react";
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
    name: "Y Combinator (W25-F26)",
    desc: "Live 2025-2026 YC cohorts via yc-oss JSON API",
  },
  workatastartup: {
    name: "Work at a Startup",
    desc: "Active hiring YC remote startups & open roles",
  },
  wellfound: {
    name: "Wellfound & Seed RSS",
    desc: "Funded <12mo (<50 team) + verified ATS boards",
  },
  producthunt: {
    name: "Product Hunt / Launches",
    desc: "Fresh 7-14 day product launches with external sites",
  },
  indie: {
    name: "Show HN / Indie Builders",
    desc: "Recent Show HN & high-velocity indie launches",
  },
  hn_hiring: {
    name: "HN Who is Hiring?",
    desc: "Hiring-post roles and source-stated locations; poster identities are not assumed to be founders",
  },
  remotive: {
    name: "Remotive public jobs API",
    desc: "Remote roles whose source-listed eligibility includes India, Asia, or worldwide",
  },
  jobicy: {
    name: "Jobicy public jobs API",
    desc: "Remote roles whose source-listed geography includes India, Asia, or worldwide",
  },
  trustmrr: {
    name: "TrustMRR",
    desc: "Revenue-verified indie product launches",
  },
};

export function SourceHealthPopover({
  isOpen,
  onClose,
  summaries,
  bySource,
  lastSyncedAt,
}: Props) {
  if (!isOpen) return null;

  const summaryMap = new Map(summaries.map((s) => [s.source, s]));
  const keys = Object.keys(SOURCE_LABELS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm p-4 sm:pt-16 sm:pr-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] backdrop-blur-md shadow-[0_16px_40px_-12px_rgba(42,83,59,0.10)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)] shrink-0 bg-[var(--surface-input)]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-lime-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Live Data Sources Health
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40"
            aria-label="Close source health"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] bg-[var(--pastel-butterSoft)] px-3 py-2 rounded-xl border border-[var(--pastel-butter)]/30">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-lime-500" />
              Engine: Live Worker + D1 Cache (No Cron Needed)
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
            const hasIssue = sum?.mode === "unavailable" || Boolean(sum?.error);

            return (
              <div
                key={key}
                className="p-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {hasIssue ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--pastel-mint)] shrink-0" />
                    )}
                      <span className="text-xs font-semibold truncate text-[var(--text-warm)]">
                      {meta.name}
                    </span>
                  </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {sum?.note || meta.desc}
                    {sum?.error && (
                      <span className="mt-1 block text-[10px] text-rose-400" title={sum.error}>
                        Error: {sum.error}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-semibold text-[var(--text-warm)]">
                    {sum ? `${sum.count} fetched · ${dbCount} in D1` : `${dbCount} in D1`}
                  </div>
                  <div className={`font-mono text-[10px] ${hasIssue ? "text-rose-400" : "text-[var(--pastel-mint)]"}`}>
                    {sum ? `${sum.durationMs}ms · ${sum.mode}` : "stored"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
