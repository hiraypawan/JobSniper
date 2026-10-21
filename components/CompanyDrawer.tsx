"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
import {
  generateAIPitches,
  getApiKey,
  AIProvider,
  AIPitchResult,
} from "@/lib/aiPitches";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
  onCompanyUpdated: (updated: Company) => void;
  onOpenAIJobHunt?: () => void;
}

type PitchTab = "classic" | "role" | "linkedin" | "email";

const STATUS_OPTIONS: { id: OutreachStatus; label: string }[] = [
  { id: "new", label: "Inbox" },
  { id: "saved", label: "Saved" },
  { id: "pitched", label: "Pitched" },
  { id: "demo_sent", label: "Demo Sent" },
  { id: "replied", label: "Replied" },
  { id: "archived", label: "Archived" },
];

export function CompanyDrawer({
  company,
  pitchSettings,
  onClose,
  onCompanyUpdated,
  onOpenAIJobHunt,
}: Props) {
  const [liveChecking, setLiveChecking] = useState(false);
  const [liveBadge, setLiveBadge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PitchTab>("classic");
  const [customPitchText, setCustomPitchText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [aiPitches, setAiPitches] = useState<AIPitchResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>("gemini");

  const generated = useMemo(() => {
    if (!company) return null;
    if (useAI && aiPitches) {
      return {
        inferred: {
          toolIdea:
            pitchSettings.customToolIdea ||
            "AI-generated custom micro-tool",
          similarCompany:
            pitchSettings.similarCompanyProof || "a recent seed-stage startup",
          bottleneckReason: "Founder-to-founder AI-crafted outreach",
          topRole: company.jobs?.[0]?.title || null,
        },
        classicSpecDm: aiPitches.classicSpecDm,
        roleHookDm: aiPitches.roleHookDm,
        linkedinNote: aiPitches.linkedinNote,
        emailSubject: aiPitches.emailSubject,
        emailBody: aiPitches.emailBody,
      };
    }
    return buildOutreachPitches(company, pitchSettings);
  }, [company, pitchSettings, useAI, aiPitches]);

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
    else if (activeTab === "linkedin")
      setCustomPitchText(generated.linkedinNote);
    else setCustomPitchText(generated.emailBody);
  }, [company, generated, activeTab]);

  // Live enrich check on open
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
  }, [company?.id]);

  // AI pitch generation
  useEffect(() => {
    if (!company?.id || !useAI) return;
    const apiKey = getApiKey(aiProvider);
    if (!apiKey) {
      setUseAI(false);
      return;
    }
    setAiLoading(true);
    generateAIPitches(company, pitchSettings, aiProvider)
      .then((result) => {
        setAiPitches(result);
      })
      .catch(() => undefined)
      .finally(() => setAiLoading(false));
  }, [company, useAI, aiProvider, pitchSettings]);

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

  const pitchTabs: { id: PitchTab; label: string }[] = [
    { id: "classic", label: "Spec Pitch DM" },
    { id: "role", label: "Open-Role Hook" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "email", label: "Cold Email" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:flex-col bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[480px] h-full sm:h-auto bg-white dark:bg-obsidian-950 border-l border-white/10 dark:border-obsidian-800 shadow-2xl overflow-y-auto flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white/95 dark:bg-obsidian-950/95 backdrop-blur-md border-b border-white/20 dark:border-obsidian-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {company.name}
              </h2>
              {company.batch && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-500 border border-orange-500/30">
                  YC {company.batch}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <Flame className="w-3 h-3" />
                Score {company.sniper_score}/100
              </span>
              <button
                type="button"
                onClick={() => setUseAI((prev) => !prev)}
                className={`ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono border transition-all ${
                  useAI
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    : "bg-white dark:bg-obsidian-900 border-white/20 dark:border-obsidian-800 text-slate-500"
                }`}
                title={useAI ? "Use template pitches" : "Use AI pitches"}
              >
                {useAI ? `✨ ${aiProvider === "gemini" ? "Gemini" : "OpenRouter"}` : "Template"}
                {aiLoading && (
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                )}
              </button>
              {onOpenAIJobHunt && (
                <button
                  type="button"
                  onClick={onOpenAIJobHunt}
                  className="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono border bg-white dark:bg-obsidian-900 border-white/20 dark:border-obsidian-800 text-slate-500 hover:text-slate-300 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
                  title="AI Job Hunt Assistant"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Job Hunt
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              {liveChecking ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-500 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Checking live signals...
                </span>
              ) : (
                liveBadge && (
                  <span className="inline-flex items-center gap-1 text-emerald-500 font-mono">
                    ✓ {liveBadge}
                  </span>
                )
              )}
              {company.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {company.location}
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
            className="p-2 rounded-xl border border-white/10 dark:border-obsidian-800 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Quick Links */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-semibold bg-white dark:bg-obsidian-900 text-slate-900 dark:text-white hover:opacity-90 transition-all"
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
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
              >
                <Briefcase className="w-3.5 h-3.5" />
                Careers ({company.open_roles_count})
                {company.hiring_provider && (
                  <span className="uppercase font-mono text-[9px]">
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
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-orange-500/30 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-all"
              >
                <Building2 className="w-3.5 h-3.5" /> YC Profile
              </a>
            )}

            {company.founder_email && (
              <a
                href={`mailto:${company.founder_email}?subject=${encodeURIComponent(generated.emailSubject)}&body=${encodeURIComponent(generated.emailBody)}`}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-all"
              >
                <Mail className="w-3 h-3" /> {company.founder_email}
              </a>
            )}
          </div>

          {/* Pitch Studio */}
          <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/5 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  5-Day Build Outreach
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-500">
                {generated.inferred.bottleneckReason}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {pitchTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    activeTab === t.id
                      ? "bg-emerald-500 text-slate-950 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                      : "bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "email" && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 text-xs">
                <span className="truncate">
                  <span className="text-slate-500">Subject:</span>{" "}
                  {generated.emailSubject}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextSafe(generated.emailSubject);
                    setCopiedKey("subject");
                    setTimeout(() => setCopiedKey(null), 1500);
                  }}
                  className="text-emerald-500 font-semibold shrink-0 hover:text-emerald-400 transition"
                >
                  {copiedKey === "subject" ? "✓ Copied" : "Copy"}
                </button>
              </div>
            )}

            <textarea
              rows={activeTab === "email" ? 8 : 4}
              value={customPitchText}
              onChange={(e) => setCustomPitchText(e.target.value)}
              className="w-full p-3.5 rounded-2xl text-xs leading-relaxed bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-500">
                {customPitchText.length} chars
                {activeTab === "linkedin" && customPitchText.length <= 300 && (
                  <span className="ml-2 text-emerald-500">Fits LinkedIn limit ✓</span>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyAndMark(false)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white dark:bg-obsidian-900 text-slate-500 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
                >
                  {copiedKey === "copied" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Only
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyAndMark(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all"
                >
                  <Send className="w-3 h-3" />
                  {copiedKey === "marked" ? "Copied & Marked" : "Copy & Mark Pitched"}
                </button>
              </div>
            </div>
          </section>

          {/* Open Roles */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                Open Roles ({company.jobs?.length || company.open_roles_count})
              </h3>
              {company.hiring_provider && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-md bg-slate-700/20 text-slate-500 border border-slate-700/40">
                  {company.hiring_provider}
                </span>
              )}
            </div>

            {company.jobs && company.jobs.length > 0 ? (
              <div className="space-y-2">
                {company.jobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-2xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {job.title}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        {job.remote && (
                          <span className="text-sky-400 font-medium">Remote</span>
                        )}
                        {job.location && <span>{job.location}</span>}
                        {job.department && <span>· {job.department}</span>}
                      </div>
                    </div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-900 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 transition-all"
                    >
                      Apply
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-xs text-slate-500 text-center">
                No structured ATS roles listed yet — founder direct pitch still works.
              </div>
            )}
          </section>

          {/* Overview */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Overview</h3>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
              {company.description}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {
                [...(company.tags || []), ...(company.tech_stack || [])].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-xl text-[10px] bg-white/5 dark:bg-obsidian-900 text-slate-500 border border-white/10 dark:border-obsidian-800"
                    >
                      {tag}
                    </span>
                  )
                )
              }
            </div>

            {scoreDetail && (
              <div className="mt-3 p-3.5 rounded-2xl bg-white/5 dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 space-y-1.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Why Score {company.sniper_score}/100
                </div>
                {scoreDetail.breakdown.map((b) => (
                  <div key={b.label} className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>• {b.label}</span>
                    <span className="font-mono text-emerald-500 dark:text-emerald-400 font-semibold">
                      +{b.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* CRM Pipeline */}
          <section className="p-4 rounded-3xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">CRM Pipeline</h3>
              {savingNotes && (
                <span className="text-[10px] font-mono text-emerald-500">Saving...</span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => patchOutreach({ outreach_status: opt.id })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    company.outreach_status === opt.id
                      ? "bg-white dark:bg-white text-slate-950 dark:text-slate-950 font-semibold border-transparent"
                      : "bg-white dark:bg-obsidian-950 border-white/10 dark:border-obsidian-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 mt-2">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add Loom link, founder notes, follow-up reminder..."
                className="w-full p-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all"
              />
              <button
                type="button"
                onClick={() => patchOutreach({ outreach_notes: notes })}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all"
              >
                Save Notes
              </button>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
