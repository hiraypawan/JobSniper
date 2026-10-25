"use client";

import React, { useState } from "react";
import { Briefcase, Check, Copy, ExternalLink, Users } from "lucide-react";
import { copyTextSafe } from "@/lib/clipboard";
import { buildOutreachPitches } from "@/lib/pitchTemplates";
import { Company, OutreachStatus, PitchSettings } from "@/lib/types";
import { ContactChannels, ContactCheckResult } from "@/components/ContactChannels";

interface Props {
  company: Company;
  pitchSettings?: PitchSettings;
  onSelect: (company: Company) => void;
  onUpdateStatus: (companyId: string, status: OutreachStatus) => void;
  onCheckCompanyContacts?: (companyId: string) => Promise<ContactCheckResult>;
}

const SOURCE_BADGES: Record<string, string> = {
  yc: "YC",
  workatastartup: "WAAS",
  wellfound: "Wellfound",
  producthunt: "Product Hunt",
  indie: "Indie / HN",
  hn_hiring: "HN Hiring",
  remotive: "Remotive",
  jobicy: "Jobicy",
  trustmrr: "TrustMRR",
};

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

const STATUS_META: Record<OutreachStatus, { label: string; color: string }> = {
  new: { label: "New", color: "text-[var(--text-muted)]" },
  saved: { label: "Saved", color: "text-[var(--pastel-amber)]" },
  pitched: { label: "Pitched", color: "text-[var(--pastel-cyan)]" },
  demo_sent: { label: "Demo Sent", color: "text-[var(--pastel-pink)]" },
  replied: { label: "Replied", color: "text-[var(--pastel-mint)]" },
  applied: { label: "Applied", color: "text-[var(--pastel-amber)]" },
  archived: { label: "Archived", color: "text-[var(--text-muted)]" },
};

export function CompanyCard({
  company,
  pitchSettings,
  onSelect,
  onUpdateStatus,
  onCheckCompanyContacts,
}: Props) {
  const [copied, setCopied] = useState(false);

  const initials = company.name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

  const statusInfo = STATUS_META[company.outreach_status] || STATUS_META.new;
  const canCopyPitch = Boolean(
    pitchSettings?.customToolIdea?.trim() &&
    (company.jobs?.[0]?.title || company.one_liner || company.description)
  );

  const handleCopyPitch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pitchSettings || !canCopyPitch) return;
    const pitches = buildOutreachPitches(company, pitchSettings);
    if (!pitches.classicSpecDm) return;
    await copyTextSafe(pitches.classicSpecDm);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCycleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: OutreachStatus[] = ["new", "saved", "pitched", "replied", "applied"];
    const idx = order.indexOf(company.outreach_status);
    const next = order[(idx + 1) % order.length];
    onUpdateStatus(company.id, next);
  };

  return (
    <article
      onClick={() => onSelect(company)}
      className="group cursor-pointer rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] backdrop-blur-sm hover:border-[var(--pastel-peach)]/60 hover:-translate-y-1 hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.18)] transition-all duration-300 p-5 flex flex-col justify-between"
    >
      <div>
        {/* Top Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--border-soft)] bg-[var(--accent-soft)] font-mono text-xs font-bold text-[var(--accent)]">
              {initials || "ST"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-semibold text-sm text-[var(--text-warm)] truncate max-w-[150px] group-hover:text-[var(--accent)] transition">
                  {company.name}
                </h2>
                {company.batch && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[var(--pastel-peach)] text-[var(--text-warm)] border border-[var(--pastel-butter)]/40">
                    {company.batch}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] truncate">
                <span className="truncate">
                  {company.domain.endsWith(".startup.local") ? "Company site not listed" : company.domain}
                </span>
                <span className="mx-0.5">·</span>
                <span className="text-[9px] font-medium text-[var(--text-muted)]">
                  {company.sources.map((s) => SOURCE_BADGES[s] || s).join(" + ")}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl border font-mono text-[10px] font-bold transition-colors ${
              company.sniper_score >= 82
                ? "bg-[var(--pastel-mintSoft)] border-[var(--pastel-mint)]/50 text-[var(--text-warm)]"
                : company.sniper_score >= 68
                  ? "bg-[var(--pastel-cyan)]/30 border-[var(--pastel-cyan)]/40 text-[var(--text-warm)]"
                  : "bg-[var(--pastel-butter)]/30 border-[var(--pastel-butter)]/40 text-[var(--text-muted)]"
            }`}
            title="Sniper Fit Score"
          >
            {company.sniper_score}
          </div>
        </div>

        {/* Description */}
        <p className="mt-4 text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
          {company.one_liner ||
          company.description ||
          `${company.name} is a startup.`}
        </p>

        <ContactChannels
          company={company}
          onCheckCompanyContacts={onCheckCompanyContacts}
          compact
        />

        {/* Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          {company.is_funded_last_12mo && (
            <span className="badge-soft bg-[var(--pastel-mintSoft)] text-[var(--text-warm)] border-[var(--pastel-mint)]/40">
              {company.funding_amount && !company.funding_amount.includes("Standard")
                ? company.funding_amount
                : "Funded <12mo"}
            </span>
          )}
          {company.is_remote && (
            <span className="badge-soft bg-[var(--pastel-cyan)]/20 text-[var(--text-warm)] border-[var(--pastel-cyan)]/30">Remote</span>
          )}
          {(company.open_roles_count > 0 || company.hiring_page_url) && (
            <span className="badge-soft bg-[var(--pastel-peach)]/30 text-[var(--text-warm)] border-[var(--pastel-peach)]/40 flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              Hiring
              {company.open_roles_count > 0 && `(${company.open_roles_count})`}
            </span>
          )}
          {company.team_size && (
            <span className="badge-soft bg-[var(--pastel-butter)]/30 text-[var(--text-muted)] border-[var(--pastel-butter)]/40 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {company.team_size}
            </span>
          )}
        </div>

        {(company.launch_date || company.launch_url || hasRevenue(company.trustmrr_mrr) || hasRevenue(company.trustmrr_last30) || hasRevenue(company.trustmrr_total)) && (
          <div className="mt-3 rounded-2xl border border-[var(--pastel-mint)]/40 bg-[var(--pastel-mintSoft)] p-3">
            {(hasRevenue(company.trustmrr_mrr) || hasRevenue(company.trustmrr_last30) || hasRevenue(company.trustmrr_total)) && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-warm)]">TrustMRR revenue evidence</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {hasRevenue(company.trustmrr_mrr) && <span className="rounded-lg border border-[var(--pastel-mint)]/50 bg-[var(--surface-card)] px-2 py-1 text-[10px] text-[var(--text-warm)]">MRR <strong>{formatRevenueUsd(company.trustmrr_mrr)}</strong></span>}
                  {hasRevenue(company.trustmrr_last30) && <span className="rounded-lg border border-[var(--pastel-mint)]/50 bg-[var(--surface-card)] px-2 py-1 text-[10px] text-[var(--text-warm)]">Last 30d <strong>{formatRevenueUsd(company.trustmrr_last30)}</strong></span>}
                  {hasRevenue(company.trustmrr_total) && <span className="rounded-lg border border-[var(--pastel-mint)]/50 bg-[var(--surface-card)] px-2 py-1 text-[10px] text-[var(--text-warm)]">Lifetime <strong>{formatRevenueUsd(company.trustmrr_total)}</strong></span>}
                </div>
              </>
            )}
            {(company.launch_date || company.launch_url) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                {company.launch_source && <span>{company.launch_source}{company.launch_date ? ` · ${new Date(company.launch_date).toLocaleDateString()}` : ""}</span>}
                {company.launch_url && (
                  <a
                    href={company.launch_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--text-warm)] underline underline-offset-2 hover:text-[var(--accent)]"
                    title={`Open the source listing${company.launch_source ? ` on ${company.launch_source}` : ""}`}
                  >
                    Open source listing <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-[var(--border-soft)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPitch}
            disabled={!canCopyPitch}
            title={canCopyPitch ? "Copy a pitch grounded in the role/company source details" : "Add your specific offer in Pitch Settings; no generic pitch is copied"}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              copied
                ? "bg-[var(--accent-soft)] text-[var(--text-warm)]"
                : "bg-[var(--pastel-butterSoft)] text-[var(--text-warm)] hover:bg-[var(--pastel-peach)] border border-[var(--pastel-butter)]/40"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy Pitch
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCycleSave}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-[10px] font-medium border transition-all ${
              statusInfo.color.includes("mint") || statusInfo.color.includes("cyan") || statusInfo.color.includes("pink")
                ? "bg-[var(--pastel-mintSoft)] border-[var(--pastel-mint)]/40 text-[var(--text-warm)] hover:border-[var(--pastel-peach)]/50 hover:text-[var(--accent)]"
                : "bg-[var(--pastel-butterSoft)] border border-[var(--pastel-butter)]/40 text-[var(--text-muted)] hover:bg-[var(--pastel-butter)]"
            }`}
            title="Cycle CRM status"
          >
            {company.outreach_status === "pitched" || company.outreach_status === "demo_sent" ? (
              <Copy className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{statusInfo.label}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {(company.hiring_page_url || company.yc_url) && (
            <a
              href={company.hiring_page_url || `${company.yc_url}/jobs`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all"
              title="Open the source-listed careers page"
            >
              <Briefcase className="w-3 h-3" /> Jobs
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
