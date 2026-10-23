"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, Globe, Linkedin, Mail, RefreshCw } from "lucide-react";
import { Company } from "@/lib/types";
import { isUsableSourceWebsite } from "@/lib/companyLinks";

export interface ContactCheckResult {
  skipped?: boolean;
  checked?: boolean;
  found?: boolean;
}

interface Props {
  company: Company;
  onCheckCompanyContacts?: (companyId: string) => Promise<ContactCheckResult>;
  compact?: boolean;
}

export function ContactChannels({ company, onCheckCompanyContacts, compact = false }: Props) {
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasWebsite = isUsableSourceWebsite(company.website, company.domain);
  const companyEmail = company.company_email?.trim() || null;
  const founderEmail = company.founder_email?.trim() || null;
  const companyLinkedIn = company.company_linkedin_url?.trim() || null;
  const founderLinkedIn = company.founder_linkedin?.trim() || null;

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [company.id]);

  const scanWebsite = async () => {
    if (!onCheckCompanyContacts || !hasWebsite || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const result = await onCheckCompanyContacts(company.id);
      setMessage(
        result.skipped
          ? "Contact scan is recent; kept the existing published details."
          : result.found
            ? "Found published contact details on the company website."
            : result.checked
              ? "No company email or LinkedIn page was published on the scanned pages."
              : "The website could not be checked."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Contact scan failed.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  const panelClass = compact
    ? "mt-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3"
    : "rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4";

  return (
    <section
      className={panelClass}
      aria-label={`Contact options for ${company.name}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Contact options
        </h3>
        {hasWebsite && onCheckCompanyContacts && (
          <button
            type="button"
            onClick={scanWebsite}
            disabled={checking}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-wait disabled:opacity-60"
            title="Check the source-listed company website for published contact details"
          >
            <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : companyEmail && companyLinkedIn ? "Refresh contacts" : "Scan website"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ChannelTile
          icon={<Globe className="h-3.5 w-3.5" />}
          label="Website"
          value={hasWebsite ? company.domain || "Open company site" : "Not verified"}
          href={hasWebsite ? company.website! : undefined}
          external
          title={hasWebsite ? "Open the website listed by the data source" : "No verified source website is available"}
        />

        {(companyEmail || founderEmail) ? (
          <ChannelTile
            icon={<Mail className="h-3.5 w-3.5" />}
            label={companyEmail ? "Company email" : "Founder email"}
            value={companyEmail || founderEmail!}
            href={`mailto:${companyEmail || founderEmail}`}
            title={companyEmail ? "Email published on the company website" : "Founder email listed in source data; verify before contacting"}
          />
        ) : (
          <ChannelTile
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Email"
            value={company.contact_checked_at ? "Not found" : hasWebsite && onCheckCompanyContacts ? "Find email" : "Unavailable"}
            onClick={hasWebsite && onCheckCompanyContacts ? scanWebsite : undefined}
            title={company.contact_checked_at ? "No email was found on the scanned pages" : "Scan the listed website for a published company email"}
            disabled={!hasWebsite || !onCheckCompanyContacts || checking || Boolean(company.contact_checked_at)}
          />
        )}

        {(companyLinkedIn || founderLinkedIn) ? (
          <ChannelTile
            icon={<Linkedin className="h-3.5 w-3.5" />}
            label={companyLinkedIn ? "Company LinkedIn" : "Founder LinkedIn"}
            value={companyLinkedIn ? "Open company page" : "Open founder profile"}
            href={companyLinkedIn || founderLinkedIn!}
            title={companyLinkedIn ? "Open the company LinkedIn page; mobile may open the LinkedIn app" : "Open the source-listed founder profile; this is not the company page"}
          />
        ) : (
          <ChannelTile
            icon={<Linkedin className="h-3.5 w-3.5" />}
            label="LinkedIn"
            value={company.contact_checked_at ? "Not found" : hasWebsite && onCheckCompanyContacts ? "Find page" : "Unavailable"}
            onClick={hasWebsite && onCheckCompanyContacts ? scanWebsite : undefined}
            title={company.contact_checked_at ? "No company LinkedIn page was found on the scanned pages" : "Scan the listed website for a company LinkedIn link"}
            disabled={!hasWebsite || !onCheckCompanyContacts || checking || Boolean(company.contact_checked_at)}
          />
        )}
      </div>

      {(!hasWebsite || message || error || (company.contact_checked_at && (!companyEmail || !companyLinkedIn))) && (
        <p className={`mt-2 text-[10px] leading-relaxed ${error ? "text-[var(--pastel-red)]" : "text-[var(--text-muted)]"}`} aria-live="polite">
          {error || message || (!hasWebsite
            ? "Website and contact details are only linked when present in trusted source data."
            : "Company contacts come from the source-listed website; founder contacts are labeled separately. Missing details are never guessed.")}
        </p>
      )}
    </section>
  );
}

function ChannelTile({
  icon,
  label,
  value,
  href,
  onClick,
  external = false,
  disabled = false,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
  onClick?: () => void;
  external?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const className = `flex min-h-[58px] min-w-0 flex-col justify-center gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card)] px-2.5 py-2 text-left transition-colors ${
    href || onClick
      ? "hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]"
      : "opacity-75"
  } ${disabled ? "cursor-default" : ""}`;
  const contents = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)]">
        {icon}<span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-[var(--text-warm)]">
        <span className="truncate">{value}</span>
        {external && href && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        title={title}
        className={className}
      >
        {contents}
      </a>
    );
  }

  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} title={title} className={className}>
        {contents}
      </button>
    );
  }

  return <div title={title} className={className}>{contents}</div>;
}
