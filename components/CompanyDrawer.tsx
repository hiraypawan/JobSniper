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
  Globe,
  Linkedin,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { copyTextSafe } from "@/lib/clipboard";
import { computeSniperScore } from "@/lib/scoring";
import {
  generateAIPitches,
  AIProvider,
  AIPitchResult,
  AIError,
} from "@/lib/aiPitches";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";
import {
  isUsableSourceWebsite,
  officialWebsiteSearchUrl,
} from "@/lib/companyLinks";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
  onCompanyUpdated: (updated: Company) => void;
  onOpenAIJobHunt?: () => void;
  onOpenPitchSettings?: () => void;
}

type PitchTab = "classic" | "role" | "linkedin" | "email";

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
}: Props) {
  const [liveChecking, setLiveChecking] = useState(false);
  const [liveBadge, setLiveBadge] = useState<string | null>(null);
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

  const runLiveCheck = async () => {
    if (!company?.id || liveChecking) return;
    setLiveChecking(true);
    setLiveBadge(null);
    try {
      const response = await fetch(
        `/api/companies/${encodeURIComponent(company.id)}/enrich`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.company) {
        throw new Error(data?.error || `Live check failed (${response.status})`);
      }
      onCompanyUpdated(data.company);
      setLiveBadge(
        data.skipped
          ? "Website details checked recently; skipped another fetch"
          : data.contactPageChecked
            ? data.contactDetailsFound
              ? "Website check complete; published company contact details are available"
              : "Scanned the public site; no company email or LinkedIn page was published there"
            : data.contactDetailsFound
              ? "Site was unavailable; previously found company details were kept"
              : "Could not reach the listed website to check contact details"
      );
    } catch (error) {
      setLiveBadge(
        error instanceof Error ? `Check failed: ${error.message}` : "Live check failed"
      );
    } finally {
      setLiveChecking(false);
    }
  };

  // AI is the only pitch source. Errors stay visible and never fall back to
  // generic or fabricated copy.
  const runAiGeneration = useCallback(async () => {
    if (!company?.id) return;
    const requestId = ++aiRequestId.current;
    setAiLoading(true);
    setAiError(null);
    // Clear the previous result so no company's copy survives regeneration.
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
  const hasSourceWebsite = isUsableSourceWebsite(company.website, company.domain);

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
      className="fixed inset-0 z-50 flex items-end sm:items-stretch justify-end bg-black/50 backdrop-blur-sm"
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
        className="w-full sm:w-[480px] sm:max-w-[90vw] h-[92dvh] sm:h-screen max-h-[92dvh] sm:max-h-screen bg-white dark:bg-obsidian-950 border-t sm:border-l border-white/10 dark:border-obsidian-800 shadow-2xl overflow-y-auto flex flex-col rounded-t-3xl sm:rounded-none overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white/95 dark:bg-obsidian-950/95 backdrop-blur-md border-b border-white/10 dark:border-obsidian-800 flex items-start justify-between gap-4 shrink-0">
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
                onClick={runAiGeneration}
                disabled={aiLoading}
                className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 transition-all disabled:opacity-60"
                title="Generate a fresh company-specific pitch with AI"
              >
                {aiLoading ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                {aiLoading ? "Writing with AI" : "Regenerate AI"}
                {aiError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              </button>
              {onOpenAIJobHunt && (
                <button
                  type="button"
                  onClick={onOpenAIJobHunt}
                  className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono border bg-white dark:bg-obsidian-900 border-white/20 dark:border-obsidian-800 text-slate-500 hover:text-slate-300 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
                  title="AI Job Hunt Assistant"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Job Hunt
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <button
                type="button"
                onClick={runLiveCheck}
                disabled={liveChecking}
                title="Scans the source-listed company homepage and at most one same-site contact page for published company email and LinkedIn, plus ATS jobs"
                className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500 hover:underline disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${liveChecking ? "animate-spin" : ""}`} />
                {liveChecking ? "Checking company site & jobs…" : "Check company website & jobs"}
              </button>
              {liveBadge && (
                <span className={`inline-flex items-center gap-1 font-mono ${
                  liveBadge.startsWith("Check failed") ||
                  liveBadge.startsWith("Could not reach") ||
                  liveBadge.startsWith("Site was unavailable")
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-500"
                }`}>
                  {liveBadge.startsWith("Check failed") ? "!" : "✓"} {liveBadge}
                </span>
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
            className="p-2 rounded-xl border border-white/10 dark:border-obsidian-800 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Quick Links */}
          <div className="flex flex-wrap items-center gap-2">
            {hasSourceWebsite ? (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                title="Website URL listed by a data source; not independently verified"
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-semibold bg-slate-900 dark:bg-obsidian-900 text-white dark:text-white hover:opacity-90 transition-all"
              >
                <Globe className="w-3.5 h-3.5" />
                Source website · {company.domain}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <a
                href={officialWebsiteSearchUrl(company.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/10 transition-all"
                title="Search the web for the official website; results are not verified"
              >
                <Search className="w-3.5 h-3.5" /> Search official website
              </a>
            )}

            {(company.hiring_page_url || company.yc_url) && (
              <a
                href={company.hiring_page_url || `${company.yc_url}/jobs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
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
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-500 hover:bg-orange-500/20 transition-all"
              >
                <Building2 className="w-3.5 h-3.5" /> YC Profile
              </a>
            )}

            {company.company_email ? (
              <a
                href={`mailto:${company.company_email}`}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-all"
                title="Company email published on the company's own website"
              >
                <Mail className="w-3 h-3" /> Company email: {company.company_email}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs text-slate-500 border border-slate-200 dark:border-obsidian-800">
                <Mail className="w-3 h-3" />
                {company.contact_checked_at ? "No company email found on scanned pages" : "Company email not fetched yet"}
              </span>
            )}

            {company.founder_email && (
              <a
                href={aiPitches
                  ? `mailto:${company.founder_email}?subject=${encodeURIComponent(generated.emailSubject)}&body=${encodeURIComponent(generated.emailBody)}`
                  : `mailto:${company.founder_email}`}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-all"
                title="Founder email listed in source data; verify before contacting"
              >
                <Mail className="w-3 h-3" /> Founder email: {company.founder_email}
              </a>
            )}

            {company.company_linkedin_url ? (
              <a
                href={company.company_linkedin_url}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-all"
                title="Company LinkedIn page found on the official website; your phone may open the LinkedIn app"
              >
                <Linkedin className="w-3.5 h-3.5" /> Company LinkedIn page
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs text-slate-500 border border-slate-200 dark:border-obsidian-800">
                <Linkedin className="w-3.5 h-3.5" />
                {company.contact_checked_at ? "No company LinkedIn link found on scanned pages" : "Company LinkedIn not fetched yet"}
              </span>
            )}

            {company.founder_linkedin && (
              <a
                href={company.founder_linkedin}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-xs font-medium border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-all"
                title="Open the source-listed founder profile; your phone may open the LinkedIn app"
              >
                <Linkedin className="w-3 h-3" /> Founder profile
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Company email and LinkedIn are extracted only from the source-listed website's homepage/contact pages. Founder contacts remain separately labeled source data; verify before contacting. Missing details are never guessed.
          </p>

          {/* Pitch Studio */}
          <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/5 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Outreach Studio
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-500">
                {aiPitches
                  ? aiPitches.angleRationale
                  : aiLoading
                    ? "AI is checking the company and role details..."
                    : "AI pitch is waiting for a successful generation."}
                {aiPitches && (
                  <>
                    • <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ AI-generated ({aiProvider})</span>
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
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-red-600 dark:text-red-400 font-semibold">AI ({aiError.provider}) error:</span>
                  <span className="text-xs text-red-600 dark:text-red-400 leading-none">{aiError.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenPitchSettings && (
                    <button
                      type="button"
                      onClick={onOpenPitchSettings}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      Open Settings
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={runAiGeneration}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 dark:border-obsidian-800 text-slate-600 dark:text-slate-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all disabled:opacity-50"
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
                      ? "bg-emerald-500 text-slate-950 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                      : "bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "email" && aiPitches && (
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
                  className="text-emerald-600 dark:text-emerald-500 font-semibold shrink-0 hover:text-emerald-500 transition"
                >
                  {copiedKey === "subject" ? "✓ Copied" : "Copy"}
                </button>
              </div>
            )}

            <textarea
              rows={activeTab === "email" ? 8 : 4}
              value={aiPitches ? customPitchText : ""}
              onChange={(e) => setCustomPitchText(e.target.value)}
              disabled={!aiPitches || aiLoading}
              placeholder={aiLoading
                ? "AI is analyzing the company's product and job requirements..."
                : "AI-generated copy appears here when generation succeeds."}
              className="w-full p-3.5 rounded-2xl text-xs leading-relaxed bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all disabled:opacity-70"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-500">
                {customPitchText.length} chars
                {activeTab === "linkedin" && customPitchText.length <= 300 && (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-500">Fits LinkedIn limit ✓</span>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyAndMark(false)}
                  disabled={!aiPitches || aiLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white dark:bg-obsidian-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-obsidian-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={!aiPitches || aiLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                          <span className="text-sky-600 dark:text-sky-400 font-medium">Remote</span>
                        )}
                        {job.location && <span>{job.location}</span>}
                        {job.department && <span>· {job.department}</span>}
                      </div>
                      {job.description && (
                        <p className="text-[10px] leading-relaxed text-slate-500 mt-1 max-h-8 overflow-hidden">
                          {job.description}
                        </p>
                      )}
                    </div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-obsidian-900 text-white dark:text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 transition-all"
                    >
                      Apply
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-xs text-slate-500 text-center">
                No public job board found for this one. A direct pitch to the founder still works.
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
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
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
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-semibold border-transparent"
                      : "bg-white dark:bg-obsidian-950 border-white/10 dark:border-obsidian-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-obsidian-800"
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
