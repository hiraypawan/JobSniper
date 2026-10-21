"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { copyTextSafe } from "@/lib/clipboard";
import { buildOutreachPitches } from "@/lib/pitchTemplates";
import { computeSniperScore } from "@/lib/scoring";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
  onCompanyUpdated: (updated: Company) => void;
}

type PitchTab = "classic" | "role" | "linkedin" | "email";

const STATUS_OPTIONS: { id: OutreachStatus; label: string }[] = [
  { id: "new", label: "Inbox" },
  { id: "saved", label: "★ Saved" },
  { id: "pitched", label: "📤 Pitched" },
  { id: "demo_sent", label: "🎥 Demo Sent" },
  { id: "replied", label: "💬 Replied" },
  { id: "archived", label: "Archive" },
];

export function CompanyDrawer({
  company,
  pitchSettings,
  onClose,
  onCompanyUpdated,
}: Props) {
  const [liveChecking, setLiveChecking] = useState(false);
  const [liveBadge, setLiveBadge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PitchTab>("classic");
  const [customPitchText, setCustomPitchText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const generated = useMemo(() => {
    if (!company) return null;
    return buildOutreachPitches(company, pitchSettings);
  }, [company, pitchSettings]);

  const scoreDetail = useMemo(() => {
    if (!company) return null;
    return computeSniperScore({
      batch: company.batch,
      last_funding_date: company.last_funding_date,
      funding_amount: company.funding_amount,
      is_funded_last_12mo: company.is_funded_last_12mo,
      team_size: company.team_size,
      open_roles_count: company.open_roles_count,
      hiring_provider: company.hiring_provider,
      is_remote: company.is_remote,
      founder_name: company.founder_name,
      founder_twitter: company.founder_twitter,
      founder_linkedin: company.founder_linkedin,
      founder_email: company.founder_email,
      sources: company.sources,
    });
  }, [company]);

  useEffect(() => {
    if (!company || !generated) return;
    setNotes(company.outreach_notes || "");
    if (activeTab === "classic") setCustomPitchText(generated.classicSpecDm);
    else if (activeTab === "role") setCustomPitchText(generated.roleHookDm);
    else if (activeTab === "linkedin") setCustomPitchText(generated.linkedinNote);
    else setCustomPitchText(generated.emailBody);
  }, [company, generated, activeTab]);

  // Trigger real-time Live Worker ATS & Homepage check whenever drawer opens!
  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    setLiveChecking(true);
    setLiveBadge(null);

    fetch(`/api/companies/${encodeURIComponent(company.id)}/enrich`, {
      method: "POST",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.company) return;
        onCompanyUpdated(data.company);
        setLiveBadge(
          data.checkedLive
            ? "Verified live right now"
            : "Synced ATS & startup signals ready"
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLiveChecking(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!company || !generated) return null;

  const patchOutreach = async (patch: {
    outreach_status?: OutreachStatus;
    outreach_notes?: string;
  }) => {
    setSavingNotes(true);
    try {
      const res = await fetch(
        `/api/companies/${encodeURIComponent(company.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.company) onCompanyUpdated(data.company);
      }
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCopyAndMark = async (markPitched: boolean) => {
    await copyTextSafe(customPitchText);
    setCopiedKey(markPitched ? "marked" : "copied");
    setTimeout(() => setCopiedKey(null), 2200);
    if (markPitched && company.outreach_status !== "pitched") {
      await patchOutreach({ outreach_status: "pitched" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-white dark:bg-obsidian-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto flex flex-col"
      >
        {/* Sticky Drawer Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white/95 dark:bg-obsidian-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {company.name}
              </h2>
              {company.batch && (
                <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                  YC {company.batch}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <Flame className="w-3.5 h-3.5" />
                Sniper {company.sniper_score}/100
              </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              {liveChecking ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Checking live homepage &amp; ATS board...
                </span>
              ) : (
                liveBadge && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono">
                    ✓ {liveBadge}
                  </span>
                )
              )}
              {company.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {company.location}
                </span>
              )}
              {company.team_size && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Users className="w-3 h-3" />
                  {company.team_size} team
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-obsidian-800"
            aria-label="Close detail drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick External Links Row */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:opacity-90 transition"
            >
              <Globe className="w-3.5 h-3.5" />
              {company.domain}
              <ExternalLink className="w-3 h-3" />
            </a>

            {(company.hiring_page_url || company.yc_url) && (
              <a
                href={company.hiring_page_url || `${company.yc_url}/jobs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/25 transition"
              >
                <Briefcase className="w-3.5 h-3.5" />
                Careers / Jobs ({company.open_roles_count})
                {company.hiring_provider && (
                  <span className="uppercase font-mono text-[10px]">
                    · {company.hiring_provider}
                  </span>
                )}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {company.yc_url && (
              <a
                href={company.yc_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20"
              >
                <Building2 className="w-3.5 h-3.5" />
                YC Profile
              </a>
            )}

            {company.founder_twitter && (
              <a
                href={company.founder_twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-obsidian-800"
              >
                <span>𝕏 {company.founder_name || "Founder"}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {company.founder_linkedin && (
              <a
                href={company.founder_linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
              >
                <Linkedin className="w-3.5 h-3.5" />
                LinkedIn
              </a>
            )}

            {company.founder_email && (
              <a
                href={`mailto:${company.founder_email}?subject=${encodeURIComponent(
                  generated.emailSubject
                )}&body=${encodeURIComponent(generated.emailBody)}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-violet-500/35 text-violet-600 dark:text-violet-300 hover:bg-violet-500/10"
              >
                <Mail className="w-3.5 h-3.5" />
                {company.founder_email}
              </a>
            )}
          </div>

          {/* 5-DAY BUILD OUTREACH STUDIO */}
          <section className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.04] dark:bg-obsidian-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold">
                  5-Day Build Outreach Helper
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                Angle: {generated.inferred.bottleneckReason}
              </span>
            </div>

            {/* Pitch Format Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "classic", label: "Spec Pitch DM" },
                  { id: "role", label: "Open-Role Hook" },
                  {
                    id: "linkedin",
                    label: `LinkedIn (${generated.linkedinNote.length}/300)`,
                  },
                  { id: "email", label: "Cold Email" },
                ] as { id: PitchTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    activeTab === t.id
                      ? "bg-emerald-500 text-slate-950 font-semibold"
                      : "bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "email" && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 text-xs">
                <span className="truncate">
                  <strong className="text-slate-500">Subject:</strong>{" "}
                  {generated.emailSubject}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextSafe(generated.emailSubject);
                    setCopiedKey("subject");
                    setTimeout(() => setCopiedKey(null), 1500);
                  }}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0"
                >
                  {copiedKey === "subject" ? "✓ Subject Copied" : "Copy Subject"}
                </button>
              </div>
            )}

            <textarea
              rows={activeTab === "email" ? 8 : 4}
              value={customPitchText}
              onChange={(e) => setCustomPitchText(e.target.value)}
              className="w-full p-3 rounded-xl text-xs leading-relaxed bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {customPitchText.length} chars
                {activeTab === "linkedin" && customPitchText.length <= 300
                  ? " · Fits LinkedIn connection note limit ✓"
                  : ""}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyAndMark(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800"
                >
                  {copiedKey === "copied" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Only
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyAndMark(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {copiedKey === "marked"
                    ? "Copied & Marked Pitched!"
                    : "Copy & Mark Pitched"}
                </button>
              </div>
            </div>
          </section>

          {/* OPEN ROLES LIST WITH DIRECT APPLY LINKS */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                Open Roles ({company.jobs?.length || company.open_roles_count})
              </h3>
              {company.hiring_provider && (
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300">
                  Provider: {company.hiring_provider}
                </span>
              )}
            </div>

            {company.jobs && company.jobs.length > 0 ? (
              <div className="space-y-2">
                {company.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-900 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {job.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {job.remote && (
                          <span className="text-sky-600 dark:text-sky-400 font-medium">
                            Remote
                          </span>
                        )}
                        {job.location && <span>{job.location}</span>}
                        {job.department && <span>· {job.department}</span>}
                      </div>
                    </div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-emerald-500/15 dark:text-emerald-300 dark:border dark:border-emerald-500/30 hover:opacity-90"
                    >
                      Apply / Spec
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No structured ATS role feed listed yet — founder direct cold pitch
                still works well for fresh launches.
              </div>
            )}
          </section>

          {/* FULL COMPANY DESCRIPTION + TAGS + SCORE BREAKDOWN */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold">Startup Overview</h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {company.description}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {[...(company.tags || []), ...(company.tech_stack || [])].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>

            {scoreDetail && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Why Sniper Fit Score = {company.sniper_score}/100
                </div>
                {scoreDetail.breakdown.map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400"
                  >
                    <span>• {b.label}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{b.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* OUTREACH CRM PIPELINE & NOTES */}
          <section className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-900 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Outreach CRM Pipeline</h3>
              {savingNotes && (
                <span className="text-[11px] font-mono text-emerald-500">
                  Saving to D1...
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => patchOutreach({ outreach_status: opt.id })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                    company.outreach_status === opt.id
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold border-transparent"
                      : "bg-white dark:bg-obsidian-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add Loom link sent, founder reply notes, or follow-up reminder..."
                className="w-full p-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button
                type="button"
                onClick={() => patchOutreach({ outreach_notes: notes })}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-950"
              >
                Save Notes
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
