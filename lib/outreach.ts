import { Company } from "./types";
import { slugify } from "./domain";

export interface ContactInfo {
  name: string;
  role: "founder" | "hr" | "cto" | "recruiter" | "engineering_manager";
  email?: string;
  linkedin?: string;
  twitter?: string;
  confidence: number;
  source: string;
}

export interface OutreachChannel {
  id: string;
  label: string;
  icon: string;
  color: string;
  url?: (company: Company, contact: ContactInfo | null) => string;
}

export const OUTREACH_CHANNELS: OutreachChannel[] = [
  {
    id: "email",
    label: "Email",
    icon: "Mail",
    color: "text-violet-500",
    url: (c, contact) =>
      contact?.email
        ? `mailto:${contact.email}`
        : `https://hunter.io/search/${c.domain}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "Linkedin",
    color: "text-sky-500",
    url: (c) =>
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        c.name
      )}`,
  },
  {
    id: "twitter",
    label: "Twitter / X",
    icon: "X",
    color: "text-slate-500",
    url: (c, contact) =>
      contact?.twitter ||
      `https://twitter.com/search?q=${encodeURIComponent(c.name)}`,
  },
  {
    id: "wellfound",
    label: "Wellfound (AngelList)",
    icon: "Briefcase",
    color: "text-orange-500",
    url: (c) =>
      `https://wellfound.com/companies/${slugify(c.name)}/jobs`,
  },
  {
    id: "otta",
    label: "Otta",
    icon: "Target",
    color: "text-emerald-500",
    url: (c) => `https://otta.com/search?q=${encodeURIComponent(c.name)}`,
  },
  {
    id: "builtin",
    label: "Built In",
    icon: "Building2",
    color: "text-slate-600",
    url: (c) => `https://builtin.com/companies/${slugify(c.name)}`,
  },
];

export function findContactUrls(
  company: Company,
  contacts: ContactInfo[]
) {
  return OUTREACH_CHANNELS.map((ch) => ({
    ...ch,
    url: ch.url
      ? ch.url(
          company,
          contacts.find((c) => c.role === "founder") || contacts[0] || null
        )
      : undefined,
  }));
}
