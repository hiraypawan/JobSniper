"use client";

import React from "react";
import { Briefcase, Copy, ExternalLink, Flame, Globe, Linkedin, Mail, RefreshCw, Search, Send, Sparkles, Users } from "lucide-react";
import {
  isUsableSourceWebsite,
  officialWebsiteSearchUrl,
} from "@/lib/companyLinks";
import { Company, OutreachStatus } from "@/lib/types";

interface Props {
  company: Company;
  onSelect: (company: Company) => void;
  onUpdateStatus: (companyId: string, status: OutreachStatus) => void;
  onCheckCompanyContacts: (companyId: string) => Promise<{
    skipped: boolean;
    checked: boolean;
    found: boolean;
  }>;
}

const SOURCE_BADGES: Record<string, string> = {
  yc: "YC",
  workatastartup: "WAAS",
  wellfound: "Funded",
  producthunt: "Product Hunt",
  indie: "Indie",
  hn_hiring: "HN Hiring",
};

const STATUS_META: Record<
  OutreachStatus,
  { label: string; color: string }
> = {
  new: { label: "New", color: "text-slate-500" },
  saved: { label: "Saved", color: "text-amber-500" },
  pitched: { label: "Pitched", color: "text-sky-500" },
  demo_sent: { label: "Demo Sent", color: "text-violet-500" },
  replied: { label: "Replied", color: "text-emerald-500" },
  archived: { label: "Archived", color: "text-slate-500" },
};

export function CompanyCard({
  company,
  onSelect,
  onUpdateStatus,
  onCheckCompanyContacts,
}: Props) {
  const [contactCheckState, setContactCheckState] = React.useState<string | null>(null);
  const [checkingContacts, setCheckingContacts] = React.useState(false);
  const initials = company.name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  const statusInfo = STATUS_META[company.outreach_status] || STATUS_META.new;
  const hasSourceWebsite = isUsableSourceWebsite(company.website, company.domain);
  const displayDomain = /\.(invalid|startup\.local)$/i.test(company.domain)
    ? "Website not sourced"
    : company.domain;

  const handleOpenAIPitch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(company);
  };

  const handleCycleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: OutreachStatus[] = ["new", "saved", "pitched", "demo_sent", "replied", "archived"];
    const currentIdx = order.indexOf(company.outreach_status);
    // If status is unknown or archived, wrap to new; otherwise advance
    const next = currentIdx === -1 ? "saved" : order[(currentIdx + 1) % order.length];
    onUpdateStatus(company.id, next as OutreachStatus);
  };

  const handleCheckContacts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checkingContacts) return;
    setCheckingContacts(true);
    setContactCheckState(null);
    try {
      const result = await onCheckCompanyContacts(company.id);
      setContactCheckState(
        result.skipped
          ? "Checked recently"
          : result.found
            ? "Contacts loaded"
            : result.checked
              ? "No contacts published"
              : "Site unavailable"
      );
    } catch (error) {
      setContactCheckState(error instanceof Error ? error.message : "Website check failed");
    } finally {
      setCheckingContacts(false);
    }
  };

  return (
    <article
      onClick={() => onSelect(company)}
      className="group cursor-pointer rounded-3xl border border-white/10 dark:border-obsidian-800/60 bg-white/5 dark:bg-obsidian-900/80 hover:border-emerald-500/40 dark:hover:border-emerald-500/20 hover:bg-white/10 dark:hover:bg-obsidian-900 transition-all duration-300 p-5 flex flex-col justify-between shadow-sm hover:shadow-md"
    >
      <div>
        {/* Top Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 dark:from-obsidian-800 dark:to-obsidian-700 border border-white/10 flex items-center justify-center font-mono text-xs font-bold text-slate-300 shrink-0">
              {initials || "ST"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-semibold text-sm text-slate-100 truncate max-w-[150px] group-hover:text-emerald-400 transition">
                  {company.name}
                </h2>
                {company.batch && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {company.batch}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                <span className="truncate">{displayDomain}</span>
                <span className="mx-0.5">·</span>
                <span className="text-[9px] font-medium text-slate-500">
                  {company.sources.map((s) => SOURCE_BADGES[s] || s).join(" + ")}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl border font-mono text-[10px] font-bold transition-colors ${
              company.sniper_score >= 82
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : company.sniper_score >= 68
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                  : "bg-slate-700/20 text-slate-500 border-slate-700/40"
            }`}
            title="Sniper Fit Score"
          >
            {company.sniper_score >= 82 && <Flame className="w-3 h-3" />}
            {company.sniper_score}
          </div>
        </div>

        {/* Description */}
        <p className="mt-4 text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {company.one_liner ||
          company.description ||
          `${company.name} is a startup.`}
        </p>

        {/* Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          {company.is_funded_last_12mo && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {company.funding_amount && !company.funding_amount.includes("Standard")
                ? company.funding_amount
                : "Funded < 12mo"}
            </span>
          )}
          {company.is_remote && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Remote
            </span>
          )}
          {(company.open_roles_count > 0 || company.hiring_page_url) && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              Hiring
              {company.open_roles_count > 0 && `(${company.open_roles_count})`}
            </span>
          )}
          {company.team_size && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono bg-slate-700/20 text-slate-500 border border-slate-700/40 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {company.team_size}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-white/10 dark:border-obsidian-800/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAIPitch}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-white/5 dark:bg-obsidian-900 text-white hover:bg-emerald-500/10 hover:text-emerald-400 border border-white/10 dark:border-obsidian-800 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" /> AI Pitch
          </button>

          <button
            type="button"
            onClick={handleCycleSave}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-[10px] font-medium border transition-all ${
              statusInfo.color.includes("emerald") || statusInfo.color.includes("sky") || statusInfo.color.includes("violet")
                ? "bg-white/5 dark:bg-obsidian-900 border-white/10 dark:border-obsidian-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-400"
                : "bg-white/5 dark:bg-obsidian-900 border-white/10 dark:border-obsidian-800 text-slate-500"
            }`}
            title="Cycle CRM status"
          >
            {company.outreach_status === "pitched" || company.outreach_status === "demo_sent" ? (
              <Send className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{statusInfo.label}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 max-w-full" onClick={(e) => e.stopPropagation()}>
          {hasSourceWebsite ? (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-slate-500 hover:text-emerald-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
              title="Open website listed by a source; not independently verified"
            >
              <Globe className="w-3 h-3" /> Source website
            </a>
          ) : (
            <a
              href={officialWebsiteSearchUrl(company.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-slate-400 hover:text-emerald-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
              title="Search the web for the company's official website; search results are not verified"
            >
              <Search className="w-3 h-3" /> Find website
            </a>
          )}

          {(company.hiring_page_url || company.yc_url) && (
            <a
              href={company.hiring_page_url || `${company.yc_url}/jobs`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2.5 rounded-2xl text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-all"
              title="Open jobs"
            >
              <span>Jobs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {company.founder_twitter && (
            <a
              href={company.founder_twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
              title={`Founder X: ${company.founder_name || company.name}`}
            >
              𝕏
            </a>
          )}

          {company.company_linkedin_url && (
            <a
              href={company.company_linkedin_url}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-sky-400 hover:bg-sky-500/10 transition-all"
              title="Company LinkedIn URL found on its website; your phone may open the LinkedIn app"
            >
              <Linkedin className="w-3 h-3" /> Company page
            </a>
          )}

          {company.founder_linkedin && (
            <a
              href={company.founder_linkedin}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-sky-400 hover:bg-sky-500/10 transition-all"
              title="Open the source-listed founder profile; your phone may open the LinkedIn app"
            >
              <Linkedin className="w-3 h-3" /> Founder profile
            </a>
          )}

          {company.company_email && (
            <a
              href={`mailto:${company.company_email}`}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-violet-400 hover:bg-violet-500/10 transition-all"
              title="Company email published on its website"
            >
              <Mail className="w-3 h-3" /> Company email
            </a>
          )}

          {company.founder_email && (
            <a
              href={`mailto:${company.founder_email}`}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-violet-300 hover:bg-violet-500/10 transition-all"
              title="Founder email from source data; verify before contacting"
            >
              <Mail className="w-3 h-3" /> Founder email
            </a>
          )}

          {(!company.company_email || !company.company_linkedin_url) && (
            <button
              type="button"
              onClick={handleCheckContacts}
              disabled={checkingContacts}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-medium text-slate-400 hover:text-emerald-400 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all disabled:opacity-60"
              title="Fetches published contact details from the listed company website and saves them to D1; one check per 30 minutes"
            >
              <RefreshCw className={`w-3 h-3 ${checkingContacts ? "animate-spin" : ""}`} />
              {checkingContacts ? "Checking site…" : contactCheckState || "Fetch site contacts"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
