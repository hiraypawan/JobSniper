"use client";

import React, { useState } from "react";
import {
  Bookmark,
  Briefcase,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Linkedin,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { copyTextSafe } from "@/lib/clipboard";
import { buildOutreachPitches } from "@/lib/pitchTemplates";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";

interface Props {
  company: Company;
  pitchSettings: PitchSettings;
  onSelect: (company: Company) => void;
  onUpdateStatus: (companyId: string, status: OutreachStatus) => void;
}

const SOURCE_BADGES: Record<string, string> = {
  yc: "YC",
  workatastartup: "WAAS",
  wellfound: "Funded",
  producthunt: "Product Hunt",
  indie: "Indie / HN",
  hn_hiring: "HN Hiring",
};

const STATUS_META: Record<
  OutreachStatus,
  { label: string; style: string }
> = {
  new: {
    label: "Save",
    style:
      "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-amber-500",
  },
  saved: {
    label: "Saved",
    style:
      "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  pitched: {
    label: "Pitched",
    style:
      "border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  demo_sent: {
    label: "Demo Sent",
    style:
      "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  replied: {
    label: "Replied",
    style:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  archived: {
    label: "Archived",
    style: "border-slate-300 text-slate-400",
  },
};

export function CompanyCard({
  company,
  pitchSettings,
  onSelect,
  onUpdateStatus,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const initials = company.name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  const scoreColor =
    company.sniper_score >= 82
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/35"
      : company.sniper_score >= 68
        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
        : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25";

  const handleCopyPitch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const pitches = buildOutreachPitches(company, pitchSettings);
    await copyTextSafe(pitches.classicSpecDm);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCycleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: OutreachStatus[] = ["new", "saved", "pitched", "replied"];
    const idx = order.indexOf(company.outreach_status);
    const next = order[(idx + 1) % order.length];
    onUpdateStatus(company.id, next);
  };

  const statusInfo = STATUS_META[company.outreach_status] || STATUS_META.new;

  return (
    <article
      onClick={() => onSelect(company)}
      className="group cursor-pointer rounded-2xl border border-slate-200/85 dark:border-slate-800/90 bg-white dark:bg-obsidian-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/45 transition-all p-4 flex flex-col justify-between shadow-2xs hover:shadow-md"
    >
      <div>
        {/* Top Row: Avatar + Name + Batch + Sniper Score */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {company.logo_url && !imgFailed ? (
              <img
                src={company.logo_url}
                alt={company.name}
                onError={() => setImgFailed(true)}
                className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0 bg-white"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-obsidian-800 dark:to-obsidian-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
                {initials || "ST"}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-semibold text-sm text-slate-900 dark:text-white truncate max-w-[165px] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  {company.name}
                </h2>
                {company.batch && (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                    {company.batch}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <span className="truncate">{company.domain}</span>
                <span>·</span>
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  {company.sources
                    .map((s) => SOURCE_BADGES[s] || s)
                    .join(" + ")}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-[11px] font-bold ${scoreColor}`}
            title="5-Day Build Sniper Fit Score (0-100)"
          >
            {company.sniper_score >= 82 && <Flame className="w-3 h-3" />}
            {company.sniper_score}
          </div>
        </div>

        {/* 2-line Description */}
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed min-h-[2.4rem]">
          {company.one_liner &&
          company.description &&
          !company.description
            .toLowerCase()
            .startsWith(company.one_liner.toLowerCase().slice(0, 20))
            ? `${company.one_liner} — ${company.description}`
            : company.description || company.one_liner}
        </p>

        {/* Signal Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {company.is_funded_last_12mo && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25">
              {company.funding_amount &&
              !company.funding_amount.includes("Standard")
                ? company.funding_amount
                : "Funded <12mo"}
            </span>
          )}

          {company.is_remote && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25">
              Remote
            </span>
          )}

          {(company.open_roles_count > 0 || company.hiring_page_url) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
              <Briefcase className="w-2.5 h-2.5" />
              Hiring
              {company.open_roles_count > 0
                ? ` (${company.open_roles_count})`
                : ""}
              {company.hiring_provider &&
                company.hiring_provider !== "other" &&
                company.hiring_provider !== "yc" && (
                  <span className="uppercase font-mono text-[9px] opacity-80">
                    · {company.hiring_provider}
                  </span>
                )}
            </span>
          )}

          {company.team_size && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/70">
              <Users className="w-2.5 h-2.5" />
              {company.team_size}
            </span>
          )}
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyPitch}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              copied
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-slate-950"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Pitch
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCycleSave}
            className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-medium border transition ${statusInfo.style}`}
            title="Click to cycle CRM status (Save -> Pitched -> Replied)"
          >
            {company.outreach_status === "pitched" ||
            company.outreach_status === "demo_sent" ? (
              <Send className="w-3 h-3" />
            ) : (
              <Bookmark className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{statusInfo.label}</span>
          </button>
        </div>

        {/* External Links */}
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition"
            title="Open company website"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Site</span>
          </a>

          {(company.hiring_page_url || company.yc_url) && (
            <a
              href={company.hiring_page_url || `${company.yc_url}/jobs`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition"
              title="Open jobs / careers board"
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
              className="px-1.5 py-1.5 rounded-lg text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800"
              title={`Founder X: ${company.founder_name || company.name}`}
            >
              𝕏
            </a>
          )}

          {company.founder_linkedin && (
            <a
              href={company.founder_linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
              title="Founder / Company LinkedIn"
            >
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          )}

          {company.founder_email && (
            <a
              href={`mailto:${company.founder_email}`}
              className="p-1.5 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
              title={`Email ${company.founder_email}`}
            >
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
