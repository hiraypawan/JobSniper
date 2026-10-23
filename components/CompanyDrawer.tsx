"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Flame,
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
  AIProvider,
  AIPitchResult,
  AIError,
} from "@/lib/aiPitches";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";
import { ContactChannels, ContactCheckResult } from "@/components/ContactChannels";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
  onCompanyUpdated: (updated: Company) => void;
  onOpenAIJobHunt?: () => void;
  onOpenPitchSettings?: () => void;
  onCheckCompanyContacts?: (companyId: string) => Promise<ContactCheckResult>;
}

type PitchTab = "classic" | "role" | "linkedin" | "email";

function hasRevenue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatRevenueUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

const STATUS_OPTIONS: { id: OutreachStatus; label: string }[] = [
  { id: "new", label: "Inbox" },
  { id: "saved", label: "Saved" },
  { id: "pitched", label: "Pitched" },
  { id: "demo_sent", label: "Demo Sent" },
  { id: "replied", label: "Replied" },
  { id: "applied", label: "Applied" },
  { id: "archived", label: "Archived" },
];

export function CompanyDrawer({
  company,
  pitchSettings,
  onClose,
  onCompanyUpdated,
  onOpenAIJobHunt,
  onOpenPitchSettings,
  onCheckCompanyContacts,
}: Props) {
  const [activeTab, setActiveTab] = useState<PitchTab>("classic");
  const [customPitchText, setCustomPitchText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [aiPitchState, setAiPitchState] = useState<{
    companyId: string;
    pitches: AIPitchResult;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; provider: string } | null>(null);
  const aiProvider: AIProvider = pitchSettings.aiProvider || "gemini";
  const aiRequestId = useRef(0);
  const aiPitches = aiPitchState && aiPitchState.companyId === company?.id
    ? aiPitchState.pitches
    : null;

  const generated = useMemo(() => {
    if (!company) return null;
    return {
      inferred: {
        toolIdea: aiPitches?.proposedBuildIdea || "",
        similarCompany: "",
        bottleneckReason: aiPitches?.angleRationale || "",
        topRole: company.jobs?.[0]?.title || null,
      },
      classicSpecDm: aiPitches?.classicSpecDm || "",
      roleHookDm: aiPitches?.roleHookDm || "",
      linkedinNote: aiPitches?.linkedinNote || "",
      emailSubject: aiPitches?.emailSubject || "",
      emailBody: aiPitches?.emailBody || "",
    };
  }, [company, aiPitches]);

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

  // Body scroll lock while drawer open
  useEffect(() => {
    if (!company) return;
    const prevOverflow = document.body.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.documentElement.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = "";
      document.documentElement.style.overscrollBehavior = "";
    };
  }, [company]);

  // Escape to close + lock
  useEffect(() => {
    if (!company) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [company, onClose]);

  const runAiGeneration = useCallback(async () => {
    if (!company?.id) return;
    const requestId = ++aiRequestId.current;
    setAiLoading(true);
    setAiError(null);
    setAiPitchState(null);
    try {
      const result = await generateAIPitches(company, pitchSettings, aiProvider);
      if (requestId === aiRequestId.current) {
        setAiPitchState({ companyId: company.id, pitches: result });
      }
    } catch (err) {
      if (requestId !== aiRequestId.current) return;
      if (err instanceof AIError) {
        setAiError({ message: err.message, provider: err.provider });
      } else {
        setAiError({
          message: err instanceof Error ? err.message : "AI generation failed",
          provider: aiProvider,
        });
      }
    } finally {
      if (requestId === aiRequestId.current) setAiLoading(false);
    }
  }, [company, pitchSettings, aiProvider]);

  useEffect(() => {
    aiRequestId.current++;
    setAiPitchState(null);
    setAiError(null);
    setAiLoading(false);
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;
    runAiGeneration();
  }, [company?.id, runAiGeneration]);

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
    if (!aiPitches || !customPitchText.trim()) return;
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
      className="fixed inset-0 z-50 flex items-end sm:items-stretch justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${company.name} details`}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, x: 0 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[480px] sm:max-w-[90vw] h-[92dvh] sm:h-screen max-h-[92dvh] sm:max-h-screen bg-[var(--surface-card)] border-t sm:border-l border-[var(--border-soft)] shadow-2xl overflow-y-auto flex flex-col rounded-t-2xl sm:rounded-none overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-[var(--surface-header)] backdrop-blur-md border-b border-[var(--border-soft)] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {company.name}
              </h2>
              {company.batch && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/30">
                  YC {company.batch}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-lime-100 dark:bg-lime-900/20 text-lime-800 dark:text-lime-200 border border-lime-200 dark:border-lime-800/30">
                <Flame className="w-3 h-3" />
                Score {company.sniper_score}/100
              </span>
              <button
                type="button"
                onClick={runAiGeneration}
                disabled={aiLoading}
                className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border border-lime-200 dark:border-lime-800/30 bg-lime-100 dark:bg-lime-900/10 text-lime-800 dark:text-lime-200 transition-all disabled:opacity-60"
                title="Generate a fresh company-specific pitch with AI"
              >
                {aiLoading ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                {aiLoading ? "Writing with AI" : "Regenerate AI"}
                {aiError && <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />}
              </button>
              {onOpenAIJobHunt && (
                <button
                  type="button"
                  onClick={onOpenAIJobHunt}
                  className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono border border-slate-200 dark:border-slate-700/40 bg-[var(--surface-input)] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all"
                  title="AI Job Hunt Assistant"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Job Hunt
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
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
            className="p-2 rounded-xl border border-[var(--border-soft)] hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <ContactChannels
            company={company}
            onCheckCompanyContacts={onCheckCompanyContacts}
          />

          {(company.hiring_page_url || company.yc_url) && (
            <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Company links</h3>
              <div className="flex flex-wrap gap-2">
                <a
                  href={company.hiring_page_url || `${company.yc_url}/jobs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card)] px-3 py-2.5 text-xs font-semibold text-[var(--text-warm)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]"
                >
                  <Briefcase className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Careers{company.open_roles_count > 0 ? ` · ${company.open_roles_count} roles` : ""}
                  {company.hiring_provider && <span className="text-[10px] text-[var(--text-muted)]">{company.hiring_provider}</span>}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
                {company.yc_url && (
                  <a
                    href={company.yc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card)] px-3 py-2.5 text-xs font-semibold text-[var(--text-warm)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]"
                  >
                    <Building2 className="h-3.5 w-3.5 text-[var(--accent)]" /> YC profile
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
              </div>
            </section>
          )}

          {(hasRevenue(company.trustmrr_mrr) || hasRevenue(company.trustmrr_last30) || hasRevenue(company.trustmrr_total) || company.launch_date || company.launch_url) && (
            <section className="rounded-2xl border border-[var(--pastel-mint)]/40 bg-[var(--pastel-mintSoft)] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-warm)]">Revenue evidence & launch source</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">Metrics below are reported by TrustMRR. Zero MRR does not mean zero earnings; receipts and lifetime revenue are separate.</p>
              </div>
              {(hasRevenue(company.trustmrr_mrr) || hasRevenue(company.trustmrr_last30) || hasRevenue(company.trustmrr_total)) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {hasRevenue(company.trustmrr_mrr) && <div className="rounded-xl border border-[var(--pastel-mint)]/40 bg-[var(--surface-card)] p-3"><div className="text-[10px] text-[var(--text-muted)]">MRR</div><div className="mt-1 text-sm font-bold font-mono text-[var(--text-warm)]">{formatRevenueUsd(company.trustmrr_mrr)}</div></div>}
                  {hasRevenue(company.trustmrr_last30) && <div className="rounded-xl border border-[var(--pastel-mint)]/40 bg-[var(--surface-card)] p-3"><div className="text-[10px] text-[var(--text-muted)]">Last 30 days</div><div className="mt-1 text-sm font-bold font-mono text-[var(--text-warm)]">{formatRevenueUsd(company.trustmrr_last30)}</div></div>}
                  {hasRevenue(company.trustmrr_total) && <div className="rounded-xl border border-[var(--pastel-mint)]/40 bg-[var(--surface-card)] p-3"><div className="text-[10px] text-[var(--text-muted)]">Lifetime revenue</div><div className="mt-1 text-sm font-bold font-mono text-[var(--text-warm)]">{formatRevenueUsd(company.trustmrr_total)}</div></div>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {company.launch_date && <span className="text-[var(--text-muted)]">Listed on {company.launch_source || "source platform"} · {new Date(company.launch_date).toLocaleDateString()}</span>}
                {company.launch_url && <a href={company.launch_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--text-warm)] underline underline-offset-2">Open source listing <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </section>
          )}

          {/* Pitch Studio */}
          <section className="rounded-2xl border border-lime-100 dark:border-lime-800/30 bg-lime-50 dark:bg-lime-900/5 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-lime-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  AI Outreach Studio
                </h3>
              </div>
              <span className="text-[10px] font-mono text-lime-600 dark:text-lime-400">
                {aiPitches
                  ? aiPitches.angleRationale
                  : aiLoading
                    ? "AI is checking the company and role details..."
                    : "AI pitch is waiting for a successful generation."}
                {aiPitches && (
                  <>
                    • <span className="text-lime-600 dark:text-lime-400 font-semibold">✓ AI-generated ({aiProvider})</span>
                  </>
                )}
              </span>
            </div>
            {aiPitches && (
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Proposed angle:</span>{" "}
                {aiPitches.proposedBuildIdea}
              </p>
            )}

            {aiError && (
              <div className="rounded-xl border border-pink-100 dark:border-pink-800/30 bg-pink-50 dark:bg-pink-900/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-pink-600 dark:text-pink-400 font-semibold">AI ({aiError.provider}) error:</span>
                  <span className="text-xs text-pink-600 dark:text-pink-400 leading-none">{aiError.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenPitchSettings && (
                    <button
                      type="button"
                      onClick={onOpenPitchSettings}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-pink-200 dark:border-pink-800/30 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-all"
                    >
                      Open Settings
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={runAiGeneration}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--border-soft)] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all disabled:opacity-50"
                  >
                    Retry
                  </button>
                  <span className="ml-auto text-[10px] text-slate-500">
                    No canned copy was substituted. Configure AI access, then retry.
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {pitchTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    activeTab === t.id
                      ? "bg-lime-100 dark:bg-lime-900/20 border-lime-200 dark:border-lime-800/30 text-lime-800 dark:text-lime-200 font-semibold shadow-[0_0_15px_rgba(132,204,22,0.15)]"
                      : "bg-[var(--surface-input)] border border-[var(--border-soft)] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "email" && aiPitches && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--surface-input)] border border-[var(--border-soft)] text-xs">
                <span className="truncate">
                  <span className="text-slate-500 dark:text-slate-400">Subject:</span>{" "}
                  {generated.emailSubject}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextSafe(generated.emailSubject);
                    setCopiedKey("subject");
                    setTimeout(() => setCopiedKey(null), 1500);
                  }}
                  className="text-lime-600 dark:text-lime-400 font-semibold shrink-0 hover:text-lime-500 dark:hover:text-lime-300 transition"
                >
                  {copiedKey === "subject" ? "✓ Copied" : "Copy"}
                </button>
              </div>
            )}

            <textarea
              rows={activeTab === "email" ? 8 : 4}
              value={aiPitches ? customPitchText : ""}
              onChange={(e) => setCustomPitchText(e.target.value)}
              className="w-full p-3.5 rounded-xl text-xs leading-relaxed bg-[var(--surface-input)] border border-[var(--border-soft)] focus:outline-none focus:ring-2 focus:ring-lime-200/50 dark:focus:ring-lime-400/30 transition-all disabled:opacity-50"
              disabled={!aiPitches || aiLoading}
              placeholder={aiLoading
                ? "AI is analyzing the company's product and job requirements..."
                : "AI-generated copy appears here when generation succeeds."}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {customPitchText.length} chars
                {activeTab === "linkedin" && customPitchText.length <= 300 && (
                  <span className="ml-2 text-lime-600 dark:text-lime-400">Fits LinkedIn limit ✓</span>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyAndMark(false)}
                  disabled={!aiPitches || aiLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border border-[var(--border-soft)] bg-[var(--surface-input)] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copiedKey === "copied" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-lime-500" />
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
                  disabled={!aiPitches || aiLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-lime-100 dark:bg-lime-900/20 text-lime-800 dark:text-lime-200 hover:bg-lime-200 dark:hover:bg-lime-800/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-lime-500" />
                Open Roles ({company.jobs?.length || company.open_roles_count})
              </h3>
              {company.hiring_provider && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-md bg-slate-700/20 text-slate-500 dark:text-slate-400 border border-slate-700/40">
                  {company.hiring_provider}
                </span>
              )}
            </div>

            {company.jobs && company.jobs.length > 0 ? (
              <div className="space-y-2">
                {company.jobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {job.title}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {job.remote && (
                          <span className="text-cyan-600 dark:text-cyan-400 font-medium">Remote</span>
                        )}
                        {job.location && <span>{job.location}</span>}
                        {job.department && <span>· {job.department}</span>}
                      </div>
                      {job.description && (
                        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1 max-h-8 overflow-hidden">
                          {job.description}
                        </p>
                      )}
                    </div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white dark:text-slate-950 hover:bg-[var(--accent-hover)] transition-all"
                    >
                      Apply
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-muted)] text-xs text-slate-500 dark:text-slate-400 text-center">
                No public job board found for this one. A direct pitch to the founder still works.
              </div>
            )}
          </section>

          {/* Overview */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Overview</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {company.description}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {
                [...(company.tags || []), ...(company.tech_stack || [])].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-xl text-[10px] bg-slate-50 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/40"
                    >
                      {tag}
                    </span>
                  )
                )
              }
            </div>

            {scoreDetail && (
              <div className="mt-3 p-3.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] space-y-1.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Why Score {company.sniper_score}/100
                </div>
                {scoreDetail.breakdown.map((b) => (
                  <div key={b.label} className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400">
                    <span>• {b.label}</span>
                    <span className="font-mono text-lime-600 dark:text-lime-400 font-semibold">
                      +{b.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* CRM Pipeline */}
          <section className="p-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">CRM Pipeline</h3>
              {savingNotes && (
                <span className="text-[10px] font-mono text-lime-500">Saving...</span>
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
                      ? "bg-[var(--accent)] dark:bg-[var(--accent)] text-white dark:text-slate-950 font-semibold border-transparent"
                      : "bg-[var(--surface-input)] border-[var(--border-soft)] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
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
                className="w-full p-2.5 rounded-xl text-xs bg-[var(--surface-input)] border border-[var(--border-soft)] focus:outline-none focus:ring-1 focus:ring-lime-200/50 dark:focus:ring-lime-400/30 transition-all"
              />
              <button
                type="button"
                onClick={() => patchOutreach({ outreach_notes: notes })}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-all"
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
