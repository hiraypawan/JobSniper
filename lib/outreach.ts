import { Company } from "./types";
import { slugify } from "./domain";

export interface ContactInfo {
  name: string;
  role: "founder" | "hr" | "cto" | "recruiter" | "engineering_manager";
  email?: string;
  linkedin?: string;
  twitter?: string;
  source: string;
}

export interface OutreachChannel {
  id: string;
  label: string;
  icon: string;
  color: string;
  url?: (company: Company, contact: ContactInfo | null) => string | undefined;
}

export const OUTREACH_CHANNELS: OutreachChannel[] = [
  {
    id: "email",
    label: "Company Email",
    icon: "Mail",
    color: "text-violet-500",
    url: (c, contact) => {
      const email = contact?.email || c.company_email;
      return email ? `mailto:${email}` : undefined;
    },
  },
  {
    id: "twitter_dm",
    label: "Twitter DM",
    icon: "X",
    color: "text-slate-500",
    url: (c, contact) => {
      const twitter = contact?.twitter || c.founder_twitter;
      if (twitter) {
        const username = twitter.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "");
        return `https://twitter.com/message/compose?to=${username}`;
      }
      return undefined;
    },
  },
  {
    id: "twitter_profile",
    label: "Twitter / X Profile",
    icon: "X",
    color: "text-slate-400",
    url: (c, contact) =>
      contact?.twitter ||
      c.founder_twitter ||
      `https://twitter.com/search?q=${encodeURIComponent(c.name)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "Linkedin",
    color: "text-sky-500",
    url: (c, contact) => contact?.linkedin || c.company_linkedin_url || undefined,
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
  {
    id: "company_contact",
    label: "Contact Form",
    icon: "Send",
    color: "text-emerald-600",
    url: (c) => {
      if (c.website && c.website.includes("http")) {
        try {
          const url = new URL(c.website);
          return `${url.origin}/contact`;
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    id: "indiehackers",
    label: "Indie Hackers",
    icon: "Sparkles",
    color: "text-purple-500",
    url: (c) => `https://www.indiehackers.com/search?query=${encodeURIComponent(c.name)}`,
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
