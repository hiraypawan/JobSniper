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
  yc: { name: "Y Combinator (W25-F26)", desc: "Live 2025-2026 YC cohorts via yc-oss JSON API" },
  workatastartup: { name: "Work at a Startup", desc: "Active hiring YC remote startups & open roles" },
  wellfound: { name: "Seed funding RSS (not Wellfound jobs)", desc: "Funding RSS and verified ATS boards, not a Wellfound jobs feed" },
  producthunt: { name: "Product Hunt / Launches", desc: "Fresh 7-14 day product launches with external sites" },
  indie: { name: "Show HN / Indie Builders", desc: "Recent Show HN & high-velocity indie launches" },
  hn_hiring: { name: "HN Who is Hiring?", desc: "Hiring-post roles and source-stated locations; poster identities are not assumed to be founders" },
  remotive: { name: "Remotive public jobs API", desc: "Remote roles with source-listed location restrictions; filters apply per job" },
  jobicy: { name: "Jobicy public jobs API", desc: "Remote roles whose source-listed geography includes India, Asia, or worldwide" },
  trustmrr: { name: "TrustMRR", desc: "Revenue-verified indie product launches" },
};

// These sources are not connected to sync. A missing permission is not proof
// that permission cannot be obtained; unavailable sites are not assumed closed.
const PENDING_SOURCES = [
  ["RareRoles", "disabled", "Public API found, but integration permission is unverified; the draft parser is not synced."],
  ["Himalayas", "disabled", "Public API found; application links, attribution, expiry and closure handling need implementation before enabling."],
  ["Career Hound", "disabled", "Terms prohibit automated access without written permission; no approved feed is configured."],
  ["SkipTheDrive", "disabled", "Likely the requested site, but its identity is uncertain. Job and search paths are restricted in robots.txt; no permitted feed established."],
  ["Built In", "disabled", "A permitted public jobs API or feed has not been established."],
  ["Underdog.io", "disabled", "Terms restrict scraping or downloading website data; no approved feed is configured."],
  ["GitHub Jobs", "defunct", "GitHub retired GitHub Jobs; jobs.github.com was sunset on March 21, 2024."],
  ["EuropeRemotely", "unavailable; disabled", "The site returned unavailable content; a permitted feed has not been established. Closure is unverified."],
  ["Jobspresso", "disabled", "A permitted jobs feed has not been established; robots.txt restricts query URLs."],
  ["Dynamite Jobs", "disabled", "robots.txt disallows /api/; another permitted feed has not been established."],
  ["Pangian", "unavailable; disabled", "The former job domain redirects to a domain-for-sale page; this does not establish the company's status."],
  ["Outsourcely", "unavailable; disabled", "The site could not be reached; closure and permitted access remain unverified."],
  ["Virtual Vocations", "disabled", "Terms prohibit automated access and scraping without prior written consent; no approved feed is configured."],
  ["CloudPeeps", "unavailable; disabled", "The site could not be reached; closure and permitted access remain unverified."],
  ["Wellfound jobs", "disabled", "No permitted public jobs feed established. The separate seed RSS integration does not fetch Wellfound jobs."],
] as const;

export function SourceHealthPopover({ isOpen, onClose, summaries, bySource, lastSyncedAt }: Props) {
  if (!isOpen) return null;
  const summaryMap = new Map(summaries.map((s) => [s.source, s]));
  const keys = Object.keys(SOURCE_LABELS);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm p-4 sm:pt-16 sm:pr-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] backdrop-blur-md shadow-[0_16px_40px_-12px_rgba(42,83,59,0.10)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)] shrink-0 bg-[var(--surface-input)]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-lime-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Live Data Sources Health</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40" aria-label="Close source health"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] bg-[var(--pastel-butterSoft)] px-3 py-2 rounded-xl border border-[var(--pastel-butter)]/30">
            <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-lime-500" />Engine: Live Worker + D1 Cache (No Cron Needed)</span>
            {lastSyncedAt && <span className="font-mono flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
          {keys.map((key) => {
            const meta = SOURCE_LABELS[key];
            const sum = summaryMap.get(key as SyncSourceSummary["source"]);
            const dbCount = bySource[key];
            const hasIssue = sum?.mode === "unavailable" || Boolean(sum?.error);
            return (
              <div key={key} className="p-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {hasIssue ? <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" /> : sum ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--pastel-mint)] shrink-0" /> : <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />}
                    <span className="text-xs font-semibold truncate text-[var(--text-warm)]">{meta.name}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {sum?.note || meta.desc}
                    {sum?.error && <span className="mt-1 block text-[10px] text-rose-400" title={sum.error}>Error: {sum.error}</span>}
                  </p>
                  {key === "remotive" && <p className="text-xs text-[var(--text-muted)] mt-1">Jobs sourced from <a href="https://remotive.com/remote-jobs" target="_blank" rel="noreferrer" className="underline">Remotive</a>. Check the original posting for current status.</p>}
                  {key === "wellfound" && <div className="mt-2 space-y-2" aria-label="Funding feed status">
                    {sum?.feedStatuses?.length ? sum.feedStatuses.map((feed) => (
                      <div key={feed.url} className="text-xs text-[var(--text-warm)]">
                        <div className="font-semibold">{feed.name}: {feed.status}</div>
                        {feed.reason && <div className="break-words">Reason: {feed.reason}</div>}
                        <div className="text-[var(--text-muted)]">Last successful sync: {feed.lastSuccessfulAt && Number.isFinite(Date.parse(feed.lastSuccessfulAt)) ? new Date(feed.lastSuccessfulAt).toLocaleString() : "Unknown"}</div>
                      </div>
                    )) : <p className="text-xs text-[var(--text-muted)]">FinSMEs and EU-Startups: not yet checked individually; last successful sync unknown.</p>}
                  </div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-semibold text-[var(--text-warm)]">{sum ? `${sum.count} fetched · ${dbCount ?? "unknown"} in D1` : `${dbCount ?? "unknown"} in D1`}</div>
                  <div className={`font-mono text-[10px] ${hasIssue ? "text-rose-400" : sum ? "text-[var(--pastel-mint)]" : "text-[var(--text-muted)]"}`}>{sum ? `${sum.durationMs}ms · ${sum.mode}` : "status unknown"}</div>
                </div>
              </div>
            );
          })}
          <section aria-label="Sources pending integration" className="space-y-2">
            <h4 className="text-xs font-semibold text-[var(--text-warm)]">Sources pending integration</h4>
            {PENDING_SOURCES.map(([name, state, reason]) => (
              <div key={name} className="p-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)]">
                <div className="text-xs font-semibold text-[var(--text-warm)]">{name}: {state}</div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{reason}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Not synced by this integration; last successful sync and stored record count are unknown.</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
