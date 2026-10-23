"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Linkedin,
  X,
  Briefcase,
  Target,
  Building2,
  Sparkles,
  FileText,
  User,
  Clock,
  Target as TargetIcon,
  Building as BuildingIcon,
  Mail as MailIcon,
  Linkedin as LinkedinIcon,
  X as XIcon,
  ChevronRight,
  ArrowUpRight,
  Download,
} from "lucide-react";
import {
  generateAIPitches,
  getApiKey,
  AIProvider,
} from "@/lib/aiPitches";
import { findAIContacts, tailorResumeAndCoverLetter, generateInterviewPrep } from "@/lib/aiJobs";
import { OUTREACH_CHANNELS, ContactInfo } from "@/lib/outreach";
import { Company, PitchSettings } from "@/lib/types";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
  onOpenPitchSettings?: () => void;
}

type JobTab = "contacts" | "resume" | "interview" | "outreach";

const TAB_LABELS: Record<JobTab, { label: string; icon: any }> = {
  contacts: { label: "Founder & HR Contacts", icon: User },
  resume: { label: "AI Resume & Cover Letter", icon: FileText },
  interview: { label: "AI Interview Prep", icon: Clock },
  outreach: { label: "Multi-Platform Outreach", icon: Briefcase },
};

export function AIJobHuntDrawer({
  company,
  pitchSettings,
  onClose,
  onOpenPitchSettings,
}: Props) {
  const [activeTab, setActiveTab] = useState<JobTab>("contacts");
  const [aiProvider, setAiProvider] = useState<AIProvider>(
    pitchSettings.aiProvider === "openrouter" ? "openrouter" : "gemini"
  );
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [resume, setResume] = useState<AITailoredResume | null>(null);
  const [interview, setInterview] = useState<AIInterviewPrep | null>(null);
  const [userResume, setUserResume] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [tabErrors, setTabErrors] = useState<Record<JobTab, string | null>>({
    contacts: null,
    resume: null,
    interview: null,
    outreach: null,
  });

  // Resolve API key from either dedicated storage (set by PitchSettingsModal) or from pitchSettings prop
  const resolvedApiKey = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const geminiStored = localStorage.getItem("startupsniper_gemini_api_key");
      const openrouterStored = localStorage.getItem("startupsniper_openrouter_api_key");
      if (aiProvider === "gemini") {
        return geminiStored || pitchSettings.geminiApiKey || "";
      }
      return openrouterStored || pitchSettings.openrouterApiKey || "";
    } catch {
      return aiProvider === "gemini"
        ? pitchSettings.geminiApiKey || ""
        : pitchSettings.openrouterApiKey || "";
    }
  }, [aiProvider, pitchSettings.geminiApiKey, pitchSettings.openrouterApiKey]);

  const hasApiKey = Boolean(resolvedApiKey);

  // Keep this drawer aligned with the provider selected in Pitch Settings.
  useEffect(() => {
    setAiProvider(pitchSettings.aiProvider === "openrouter" ? "openrouter" : "gemini");
  }, [pitchSettings.aiProvider]);

  // Reset state when company changes
  useEffect(() => {
    if (company?.id) {
      setContacts([]);
      setResume(null);
      setInterview(null);
      setError(null);
      setTabErrors({ contacts: null, resume: null, interview: null, outreach: null });
      setActiveTab("contacts");
    }
  }, [company?.id]);

  // Clear stale tab errors when the provider is switched (key status recomputes)
  useEffect(() => {
    setTabErrors({ contacts: null, resume: null, interview: null, outreach: null });
    setError(null);
  }, [aiProvider]);

  // Body scroll lock
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

  // Escape to close
  useEffect(() => {
    if (!company) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [company, onClose]);

  const findContacts = async () => {
    if (!company) return;
    setLoading((p) => ({ ...p, contacts: true }));
    setTabErrors((p) => ({ ...p, contacts: null }));
    setError(null);
    try {
      const result = await findAIContacts(company, aiProvider, resolvedApiKey);
      setContacts(result.contacts);
    } catch (err) {
      setTabErrors((p) => ({
        ...p,
        contacts: err instanceof Error ? err.message : "Contact search failed.",
      }));
    } finally {
      setLoading((p) => ({ ...p, contacts: false }));
    }
  };

  const generateResume = async () => {
    if (!company || !hasApiKey || !userResume) return;
    setLoading((p) => ({ ...p, resume: true }));
    setTabErrors((p) => ({ ...p, resume: null }));
    setError(null);
    try {
      const result = await tailorResumeAndCoverLetter(
        company,
        userResume,
        aiProvider,
        resolvedApiKey
      );
      setResume(result);
    } catch (err) {
      setTabErrors((p) => ({
        ...p,
        resume: err instanceof Error ? err.message : "Resume generation failed.",
      }));
    } finally {
      setLoading((p) => ({ ...p, resume: false }));
    }
  };

  const generateInterview = async () => {
    if (!company || !hasApiKey || !roleTitle) return;
    setLoading((p) => ({ ...p, interview: true }));
    setTabErrors((p) => ({ ...p, interview: null }));
    setError(null);
    try {
      const result = await generateInterviewPrep(
        company,
        roleTitle,
        aiProvider,
        resolvedApiKey
      );
      setInterview(result);
    } catch (err) {
      setTabErrors((p) => ({
        ...p,
        interview: err instanceof Error ? err.message : "Interview prep failed.",
      }));
    } finally {
      setLoading((p) => ({ ...p, interview: false }));
    }
  };

  const retryTab = (tab: JobTab) => {
    setTabErrors((p) => ({ ...p, [tab]: null }));
    if (tab === "contacts") findContacts();
    else if (tab === "resume") generateResume();
    else generateInterview();
  };

  const outreachChannels = useMemo(() => {
    if (!company) return [];
    const primaryContact =
      contacts.find((c) => c.role === "founder") || contacts[0] || null;
    return OUTREACH_CHANNELS.map((ch) => ({
      ...ch,
      url: ch.url
        ? ch.url(company, primaryContact)
        : undefined,
    }));
  }, [company, contacts]);

  if (!company) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md p-0 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`AI Job Hunt for ${company.name}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[640px] h-[92dvh] sm:h-[85vh] sm:max-h-[85dvh] bg-white dark:bg-obsidian-950 border border-white/10 dark:border-obsidian-800 shadow-2xl overflow-hidden flex flex-col rounded-t-3xl sm:rounded-3xl overscroll-contain"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 dark:border-obsidian-800 flex items-start justify-between gap-4 shrink-0 bg-white dark:bg-obsidian-950">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                AI Job Hunt Assistant
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                {company.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Find contacts, tighten your resume, get ready for the interview.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Provider toggle */}
        <div className="px-6 py-2 border-b border-white/5 dark:border-obsidian-800/50 bg-slate-50/50 dark:bg-obsidian-900/30 flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">AI Provider:</span>
          <div className="inline-flex rounded-xl border border-white/10 dark:border-obsidian-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setAiProvider("gemini")}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${aiProvider === "gemini" ? "bg-emerald-500 text-slate-950" : "bg-white dark:bg-obsidian-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-obsidian-800"}`}
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => setAiProvider("openrouter")}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${aiProvider === "openrouter" ? "bg-emerald-500 text-slate-950" : "bg-white dark:bg-obsidian-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-obsidian-800"}`}
            >
              OpenRouter (free)
            </button>
          </div>
          {hasApiKey ? (
            <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-500 font-mono">Key set ✓</span>
          ) : (
            <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-500 font-mono">No key</span>
          )}
        </div>

        {/* AI Key Setup banner */}
        {!hasApiKey && (
          <div className="mx-6 mt-4 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 space-y-3 shrink-0">
            <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              No API key yet
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Add a Gemini or OpenRouter key in &quot;My 5d Offer&quot; for AI resume and interview tools. Source-listed contacts remain available without a key; no addresses or profiles are guessed.
            </p>
            <button
              type="button"
              onClick={() => {
                if (onOpenPitchSettings) onOpenPitchSettings();
                else onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all"
            >
              Open Settings
            </button>
          </div>
        )}

        {/* Tabs, scrolled sideways on a phone */}
        <div className="flex gap-1 border-b border-white/10 dark:border-obsidian-800 px-3 sm:px-6 overflow-x-auto no-scrollbar shrink-0 [-webkit-overflow-scrolling:touch] overscroll-x-contain">
          {(Object.keys(TAB_LABELS) as JobTab[]).map((tab) => {
            const LabelIcon = TAB_LABELS[tab].icon;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-3 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${
                  active
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-500 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800"
                }`}
              >
                <LabelIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{TAB_LABELS[tab].label}</span>
                <span className="sm:hidden">{tab === "contacts" ? "Contacts" : tab === "resume" ? "Resume" : tab === "interview" ? "Interview" : "Outreach"}</span>
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 overscroll-contain [-webkit-overflow-scrolling:touch]">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* CONTACTS TAB */}
          {activeTab === "contacts" && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Source-listed Contacts
                  </h3>
                  <p className="text-xs text-slate-500">
                    Person details are source-listed; company email and LinkedIn links are scanned from the listed website. Nothing is guessed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={findContacts}
                  disabled={loading.contacts}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500 hover:text-slate-950 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading.contacts ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                      Finding...
                    </span>
                  ) : "Show Source Contacts"}
                </button>
              </div>

              {tabErrors.contacts && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-red-600 dark:text-red-400 font-semibold">Contacts error:</span>{" "}
                    <span className="text-red-600 dark:text-red-400">{tabErrors.contacts}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryTab("contacts")}
                    disabled={loading.contacts}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 dark:border-obsidian-800 text-slate-600 dark:text-slate-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}

              {contacts.length > 0 && (
                <div className="space-y-3">
                  {contacts.map((c, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${
                            c.role === "founder"
                              ? "text-emerald-600 dark:text-emerald-500"
                              : c.role === "hr"
                                ? "text-sky-600 dark:text-sky-500"
                                : c.role === "cto"
                                  ? "text-violet-600 dark:text-violet-500"
                                  : "text-slate-500"
                          }`}
                        >
                          {c.role}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {c.source}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-900 dark:text-white flex-wrap">
                        <span className="font-medium">{c.name}</span>
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="ml-1 text-emerald-600 dark:text-emerald-500 hover:text-emerald-500 font-mono text-[11px] break-all"
                          >
                            {c.email}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {c.linkedin && (
                          <a
                            href={c.linkedin}
                            className="p-1.5 rounded-lg text-sky-600 dark:text-sky-500 hover:bg-sky-500/10 transition-all"
                            title="LinkedIn"
                          >
                            <LinkedinIcon className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {c.twitter && (
                          <a
                            href={c.twitter}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition-all"
                            title="Twitter"
                          >
                            <XIcon className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(company.company_email || company.company_linkedin_url) && (
                <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                    Company website contacts
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {company.company_email && (
                      <a href={`mailto:${company.company_email}`} className="text-violet-600 dark:text-violet-400 hover:underline">
                        {company.company_email}
                      </a>
                    )}
                    {company.company_linkedin_url && (
                      <a href={company.company_linkedin_url} className="text-sky-600 dark:text-sky-400 hover:underline">
                        Company LinkedIn page
                      </a>
                    )}
                  </div>
                </div>
              )}

              {contacts.length === 0 && !loading.contacts && !error && (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-500">
                    No named person is listed in the source data. Company-level links above come from the website scan. If not checked yet, close this panel and use Check company website &amp; jobs in the company drawer. The app will not guess contact details.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* RESUME TAB */}
          {activeTab === "resume" && (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Resume & Cover Letter
                </h3>
                <p className="text-xs text-slate-500">
                  A summary, a few bullets and a cover letter for this company
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Your Resume / Experience
                </label>
                <textarea
                  rows={6}
                  value={userResume}
                  onChange={(e) => setUserResume(e.target.value)}
                  placeholder="Paste your resume or work experience here..."
                  className="w-full p-3 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all"
                />
              </div>

              <button
                type="button"
                onClick={generateResume}
                disabled={loading.resume || !hasApiKey || !userResume.trim()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading.resume ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                    Generating...
                  </span>
                ) : "Generate Tailored Resume"}
              </button>

              {tabErrors.resume && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-red-600 dark:text-red-400 font-semibold">Resume error:</span>{" "}
                    <span className="text-red-600 dark:text-red-400">{tabErrors.resume}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryTab("resume")}
                    disabled={loading.resume}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 dark:border-obsidian-800 text-slate-600 dark:text-slate-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}

              {resume && (
                <section className="space-y-4 pt-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Tailored Summary
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {resume.summary}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Key Skills
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {resume.skills.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-xl text-[10px] bg-white/5 dark:bg-obsidian-900 text-slate-600 dark:text-slate-400 border border-white/10 dark:border-obsidian-800"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Experience Bullets
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {resume.experience_bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-emerald-500">▹</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                      Cover Letter
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">
                      {resume.cover_letter}
                    </p>
                    <p className="mt-2 text-[10px] font-mono text-emerald-600 dark:text-emerald-500">
                      Subject: {resume.subject_line}
                    </p>
                  </div>
                </section>
              )}
            </section>
          )}

          {/* INTERVIEW TAB */}
          {activeTab === "interview" && (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Interview Prep
                </h3>
                <p className="text-xs text-slate-500">
                  Questions this team is likely to ask, plus a few to ask them
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Target Role Title
                </label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Founding Engineer, Product Manager"
                  className="w-full p-3 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all"
                />
              </div>

              <button
                type="button"
                onClick={generateInterview}
                disabled={loading.interview || !hasApiKey || !roleTitle.trim()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading.interview ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                    Generating...
                  </span>
                ) : "Generate Interview Prep"}
              </button>

              {tabErrors.interview && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-red-600 dark:text-red-400 font-semibold">Interview error:</span>{" "}
                    <span className="text-red-600 dark:text-red-400">{tabErrors.interview}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryTab("interview")}
                    disabled={loading.interview}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 dark:border-obsidian-800 text-slate-600 dark:text-slate-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}

              {interview && (
                <section className="space-y-4 pt-2">
                  <section>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Company Questions
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {interview.company_questions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-sky-500">▹</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Role Questions
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {interview.role_questions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-sky-500">▹</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Questions to Ask Founder
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {interview.questions_to_ask.map((q, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-emerald-500">▹</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Key Talking Points
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      {interview.key_talking_points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-violet-500">▹</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </section>
                </section>
              )}
            </section>
          )}

          {/* OUTREACH TAB */}
          {activeTab === "outreach" && (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Multi-Platform Outreach
                </h3>
                <p className="text-xs text-slate-500">
                  Places founders still read their own messages
                </p>
              </div>

              <div className="space-y-3">
                {outreachChannels.map((ch) => {
                  const IconMap: Record<string, any> = {
                    Mail: MailIcon,
                    Linkedin: LinkedinIcon,
                    X: XIcon,
                    Briefcase: Briefcase,
                    Target: TargetIcon,
                    Building2: BuildingIcon,
                  };
                  const Icon = IconMap[ch.icon] || Briefcase;
                  const channelClass = `flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all border ${
                    ch.color === "text-violet-500"
                      ? "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-400 hover:bg-violet-500/15"
                      : ch.color === "text-sky-500"
                        ? "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-400 hover:bg-sky-500/15"
                        : ch.color === "text-emerald-500"
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15"
                          : ch.color === "text-orange-500"
                            ? "border-orange-500/20 bg-orange-500/5 text-orange-700 dark:text-orange-400 hover:bg-orange-500/15"
                            : "border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-600 dark:text-slate-400 hover:bg-white/10 dark:hover:bg-obsidian-800"
                  }`;
                  return ch.url ? (
                    <a
                      key={ch.id}
                      href={ch.url}
                      target={ch.id === "linkedin" ? undefined : "_blank"}
                      rel={ch.id === "linkedin" ? undefined : "noopener noreferrer"}
                      className={channelClass}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1">{ch.label}</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </a>
                  ) : (
                    <div
                      key={ch.id}
                      aria-disabled="true"
                      title="No direct contact link is stored; use Check company website in the company drawer"
                      className={`${channelClass} cursor-not-allowed opacity-50`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1">{ch.label}</span>
                      <span className="text-[10px]">Not found yet</span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 p-4">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Where to write
                </h4>
                <p className="text-xs text-slate-500">
                  Wellfound, Otta and Built In get a fraction of the traffic
                  LinkedIn does, so a founder is more likely to see what you
                  send. Mention their product in the first line and skip the
                  pitch deck.
                </p>
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}

interface AITailoredResume {
  summary: string;
  skills: string[];
  experience_bullets: string[];
  cover_letter: string;
  subject_line: string;
}

interface AIInterviewPrep {
  company_questions: string[];
  role_questions: string[];
  behavioral_questions: string[];
  questions_to_ask: string[];
  key_talking_points: string[];
}
