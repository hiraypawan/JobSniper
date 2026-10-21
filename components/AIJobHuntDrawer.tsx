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
import { buildOutreachPitches } from "@/lib/pitchTemplates";

interface Props {
  company: Company | null;
  pitchSettings: PitchSettings;
  onClose: () => void;
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
}: Props) {
  const [activeTab, setActiveTab] = useState<JobTab>("contacts");
  const [aiProvider, setAiProvider] = useState<AIProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [resume, setResume] = useState<AITailoredResume | null>(null);
  const [interview, setInterview] = useState<AIInterviewPrep | null>(null);
  const [userResume, setUserResume] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const apiKeyFromStorage = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      return (
        localStorage.getItem("startupsniper_gemini_api_key") ||
        localStorage.getItem("startupsniper_openrouter_api_key") ||
        ""
      );
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    if (apiKeyFromStorage) setApiKey(apiKeyFromStorage);
  }, [apiKeyFromStorage]);

  const findContacts = async () => {
    if (!company || !apiKey) return;
    setLoading((p) => ({ ...p, contacts: true }));
    setError(null);
    try {
      const result = await findAIContacts(company, aiProvider, apiKey);
      if (result) setContacts(result.contacts);
      else setError("Could not infer contacts. Try a different provider.");
    } catch {
      setError("Contact search failed.");
    } finally {
      setLoading((p) => ({ ...p, contacts: false }));
    }
  };

  const generateResume = async () => {
    if (!company || !apiKey || !userResume) return;
    setLoading((p) => ({ ...p, resume: true }));
    setError(null);
    try {
      const result = await tailorResumeAndCoverLetter(
        company,
        userResume,
        aiProvider,
        apiKey
      );
      if (result) setResume(result);
      else setError("Resume generation failed.");
    } catch {
      setError("Resume generation failed.");
    } finally {
      setLoading((p) => ({ ...p, resume: false }));
    }
  };

  const generateInterview = async () => {
    if (!company || !apiKey || !roleTitle) return;
    setLoading((p) => ({ ...p, interview: true }));
    setError(null);
    try {
      const result = await generateInterviewPrep(
        company,
        roleTitle,
        aiProvider,
        apiKey
      );
      if (result) setInterview(result);
      else setError("Interview prep failed.");
    } catch {
      setError("Interview prep failed.");
    } finally {
      setLoading((p) => ({ ...p, interview: false }));
    }
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

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[600px] h-auto sm:h-[85vh] bg-white dark:bg-obsidian-950 border border-white/10 dark:border-obsidian-800 shadow-2xl overflow-y-auto flex flex-col rounded-3xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 dark:border-obsidian-800 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                AI Job Hunt Assistant
              </h2>
              {company && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  {company.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Find contacts, tailor applications, and prep for interviews using AI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* AI Key Setup */}
        {!apiKey && (
          <div className="p-6 space-y-3 border-b border-white/10 dark:border-obsidian-800 bg-slate-50/50 dark:bg-obsidian-900/50">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
              AI API Key Required
            </h3>
            <p className="text-xs text-slate-500">
              Add your Gemini or OpenRouter key in "My 5d Offer" settings to use
              AI contact finder, resume tailor, and interview prep.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all"
            >
              Open Settings
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 dark:border-obsidian-800 px-6">
          {(Object.keys(TAB_LABELS) as JobTab[]).map((tab) => {
            const LabelIcon = TAB_LABELS[tab].icon;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800"
                }`}
              >
                <LabelIcon className="w-3 h-3" />
                {TAB_LABELS[tab].label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* CONTACTS TAB */}
          {activeTab === "contacts" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Founder & HR Contacts
                  </h3>
                  <p className="text-xs text-slate-500">
                    AI-inferred emails and social profiles for direct outreach
                  </p>
                </div>
                <button
                  type="button"
                  onClick={findContacts}
                  disabled={loading.contacts || !apiKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-slate-950 transition-all disabled:opacity-50"
                >
                  {loading.contacts ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                      Finding...
                    </span>
                  ) : "Find Contacts"}
                </button>
              </div>

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
                              ? "text-emerald-500"
                              : c.role === "hr"
                                ? "text-sky-500"
                                : c.role === "cto"
                                  ? "text-violet-500"
                                  : "text-slate-500"
                          }`}
                        >
                          {c.role}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {Math.round(c.confidence)}% confidence
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-900 dark:text-white">
                        <span className="font-medium">{c.name}</span>
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="ml-1 text-emerald-500 hover:text-emerald-400 font-mono text-[10px]"
                          >
                            {c.email}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {c.linkedin && (
                          <a
                            href={c.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-500/10 transition-all"
                            title="LinkedIn"
                          >
                            <LinkedinIcon className="w-3 h-3" />
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

              {contacts.length === 0 && !loading.contacts && !error && (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-500">
                    No contacts found yet. Click "Find Contacts" to use AI to
                    infer founder and HR emails.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* RESUME TAB */}
          {activeTab === "resume" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    AI Resume & Cover Letter
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tailor your resume and write a cover letter for this company
                  </p>
                </div>
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
                disabled={loading.resume || !apiKey || !userResume}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50"
              >
                {loading.resume ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                    Generating...
                  </span>
                ) : "Generate Tailored Resume"}
              </button>

              {resume && (
                <section className="space-y-4">
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
                          className="px-2.5 py-1 rounded-xl text-[10px] bg-white/5 dark:bg-obsidian-900 text-slate-500 border border-white/10 dark:border-obsidian-800"
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
                    <p className="mt-2 text-[10px] font-mono text-emerald-500">
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    AI Interview Prep
                  </h3>
                  <p className="text-xs text-slate-500">
                    Company-specific questions and talking points
                  </p>
                </div>
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
                disabled={loading.interview || !apiKey || !roleTitle}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50"
              >
                {loading.interview ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z"></path></svg>
                    Generating...
                  </span>
                ) : "Generate Interview Prep"}
              </button>

              {interview && (
                <section className="space-y-4">
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Multi-Platform Outreach
                  </h3>
                  <p className="text-xs text-slate-500">
                    Reach founders on less competitive platforms
                  </p>
                </div>
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
                  return (
                    <a
                      key={ch.id}
                      href={ch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all border ${
                        ch.color === "text-violet-500"
                          ? "border-violet-500/20 bg-violet-500/5 text-violet-600 hover:bg-violet-500/15"
                          : ch.color === "text-sky-500"
                            ? "border-sky-500/20 bg-sky-500/5 text-sky-600 hover:bg-sky-500/15"
                            : ch.color === "text-emerald-500"
                              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/15"
                              : ch.color === "text-orange-500"
                                ? "border-orange-500/20 bg-orange-500/5 text-orange-600 hover:bg-orange-500/15"
                                : "border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-600 dark:text-slate-400 hover:bg-white/10 dark:hover:bg-obsidian-800"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1">{ch.label}</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </a>
                  );
                })}
              </div>

              <div className="rounded-xl border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 p-4">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Pro Tip
                </h4>
                <p className="text-xs text-slate-500">
                  Less competition on Wellfound, Otta, and Built In — founders
                  there respond faster than on LinkedIn. Combine with AI-tailored
                              emails for 3x response rates.
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
