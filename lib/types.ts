export type CompanySource =
  | "yc"
  | "workatastartup"
  | "wellfound"
  | "producthunt"
  | "indie"
  | "hn_hiring";

export type HiringProvider =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "breezy"
  | "recruitee"
  | "dover"
  | "yc"
  | "other"
  | null;

export type OutreachStatus =
  | "new"
  | "saved"
  | "pitched"
  | "demo_sent"
  | "replied"
  | "archived";

export interface JobPosting {
  id: string;
  company_id: string;
  title: string;
  url: string;
  location: string | null;
  remote: boolean;
  department?: string | null;
  description?: string | null;
  posted_at?: string | null;
}

export interface NormalizedCompanyInput {
  id?: string;
  name: string;
  source: CompanySource;
  batch?: string | null;
  description: string;
  one_liner?: string;
  website: string;
  yc_url?: string | null;
  logo_url?: string | null;
  location?: string | null;
  team_size?: number | null;
  is_remote: boolean;
  last_funding_date?: string | null;
  funding_amount?: string | null;
  is_funded_last_12mo: boolean;
  hiring_page_url?: string | null;
  hiring_provider?: HiringProvider;
  open_roles_count?: number;
  tags?: string[];
  tech_stack?: string[];
  founder_name?: string | null;
  founder_twitter?: string | null;
  founder_linkedin?: string | null;
  founder_email?: string | null;
  jobs?: Omit<JobPosting, "company_id">[];
}

export interface Company {
  id: string;
  domain: string;
  name: string;
  source: CompanySource;
  sources: CompanySource[];
  batch: string | null;
  description: string;
  one_liner: string;
  website: string;
  yc_url: string | null;
  logo_url: string | null;
  location: string | null;
  team_size: number | null;
  is_remote: boolean;
  last_funding_date: string | null;
  funding_amount: string | null;
  is_funded_last_12mo: boolean;
  hiring_page_url: string | null;
  hiring_provider: HiringProvider;
  open_roles_count: number;
  tags: string[];
  tech_stack: string[];
  founder_name: string | null;
  founder_twitter: string | null;
  founder_linkedin: string | null;
  founder_email: string | null;
  sniper_score: number;
  outreach_status: OutreachStatus;
  outreach_notes: string;
  pitched_at: string | null;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
  jobs?: JobPosting[];
}

export interface FetcherResult {
  source: CompanySource;
  companies: NormalizedCompanyInput[];
  durationMs: number;
  mode: "live" | "live+fallback" | "cached";
  note?: string;
  error?: string;
}

export interface SyncSourceSummary {
  source: CompanySource;
  count: number;
  jobsCount: number;
  durationMs: number;
  mode: "live" | "live+fallback" | "cached";
  note?: string;
  error?: string;
}

export interface DashboardStats {
  totalCompanies: number;
  fundedLast12Mo: number;
  hiringNow: number;
  remoteCompanies: number;
  hotLeadsCount: number;
  totalOpenRoles: number;
  pipelineCounts: Record<OutreachStatus, number>;
  followUpDueCount: number;
  bySource: Record<string, number>;
  byBatch: Record<string, number>;
  byProvider: Record<string, number>;
  lastSyncedAt: string | null;
  lastSyncSummary: SyncSourceSummary[];
}

export interface CompaniesApiResponse {
  companies: Company[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  stats: DashboardStats;
  backgroundSyncTriggered?: boolean;
}

export interface PitchSettings {
  aiProvider?: "gemini" | "openrouter";
  senderName: string;
  customToolIdea: string;
  similarCompanyProof: string;
  deliveryDays: number;
  demoOffer: string;
  geminiApiKey?: string;
  openrouterApiKey?: string;
}
