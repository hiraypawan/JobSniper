"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Crosshair, RefreshCw } from "lucide-react";
import { CompanyCard } from "@/components/CompanyCard";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { AIJobHuntDrawer } from "@/components/AIJobHuntDrawer";
import { FilterBar, FilterState } from "@/components/FilterBar";
import { IndieLaunchControls, LaunchWindow } from "@/components/IndieLaunchControls";
import { HeaderBar } from "@/components/HeaderBar";
import { KpiStrip } from "@/components/KpiStrip";
import { PitchSettingsModal } from "@/components/PitchSettingsModal";
import { SourceHealthPopover } from "@/components/SourceHealthPopover";
import { DEFAULT_PITCH_SETTINGS } from "@/lib/pitchSettings";
import {
  CompaniesApiResponse,
  Company,
  DashboardStats,
  OutreachStatus,
  PitchSettings,
} from "@/lib/types";

const DEFAULT_FILTERS: FilterState = {
  funded12mo: false,
  fresh14d: false,
  indiaOnly: false,
  fresherOnly: false,
  remote: false,
  hiring: false,
  smallTeam: false,
  source: "all",
  batch: "all",
  ats: "all",
  pipeline: "all",
  sort: "score",
  search: "",
};

function getActiveFilterLabels(filters: FilterState): string[] {
  const labels: string[] = [];
  if (filters.funded12mo) labels.push("Funded in the last 12 months");
  if (filters.fresh14d) labels.push("Funding or job posted within 14 days");
  if (filters.indiaOnly) labels.push("India/Asia/worldwide eligibility listed");
  if (filters.fresherOnly) labels.push("Fresher/entry-level terms in role posting");
  if (filters.remote) labels.push("Remote");
  if (filters.hiring) labels.push("Hiring");
  if (filters.smallTeam) labels.push("Team size up to 15");
  if (filters.source !== "all") labels.push(`Source: ${filters.source}`);
  if (filters.batch !== "all") labels.push(`Batch: ${filters.batch}`);
  if (filters.ats !== "all") labels.push(`ATS: ${filters.ats}`);
  if (filters.pipeline !== "all") labels.push(`Pipeline: ${filters.pipeline}`);
  if (filters.search.trim()) labels.push(`Search: “${filters.search.trim()}”`);
  return labels;
}

const STORAGE_PITCH_KEY = "startupsniper_pitch_settings_v1";

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "network error";
  if (/exceeded D1's free tier daily row write limit/i.test(message)) {
    return "Cloudflare D1's daily write quota is exhausted. It resets at 05:30 IST (00:00 UTC); retry after then.";
  }
  return message.slice(0, 180);
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export default function DashboardPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [aiJobHuntCompany, setAiJobHuntCompany] = useState<Company | null>(
    null
  );
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pitchModalOpen, setPitchModalOpen] = useState(false);
  const [pitchSettings, setPitchSettings] = useState<PitchSettings>(
    DEFAULT_PITCH_SETTINGS
  );
  const [darkMode, setDarkMode] = useState(false);
  const [activeLens, setActiveLens] = useState("all");
  const [activeSection, setActiveSection] = useState<"leads" | "indie">("leads");
  const [launchWindow, setLaunchWindow] = useState<LaunchWindow>("7d");
  const [earningOnly, setEarningOnly] = useState(false);
  const latestCompaniesRequest = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PITCH_KEY);
      let parsed: Partial<PitchSettings> = (() => { try { const value = saved ? JSON.parse(saved) : {}; return value && typeof value === "object" ? value : {}; } catch { return {}; } })();

      // Phase D migration: copy legacy per-provider localStorage slots into
      // pitch_settings_v1 when no key is stored there yet (single source of truth).
      if (!parsed.geminiApiKey) {
        const legacyGemini = localStorage.getItem("startupsniper_gemini_api_key");
        if (legacyGemini) parsed.geminiApiKey = legacyGemini;
      }
      if (!parsed.openrouterApiKey) {
        const legacyOpenRouter = localStorage.getItem(
          "startupsniper_openrouter_api_key"
        );
        if (legacyOpenRouter) parsed.openrouterApiKey = legacyOpenRouter;
      }

      // Treat browser storage as untrusted input: older versions or manual edits
      // can leave malformed values that would otherwise break the settings UI.
      const normalized: PitchSettings = {
        ...DEFAULT_PITCH_SETTINGS,
        aiProvider: parsed.aiProvider === "gemini" ? "gemini" : "openrouter",
        senderName: typeof parsed.senderName === "string" ? parsed.senderName : DEFAULT_PITCH_SETTINGS.senderName,
        customToolIdea: typeof parsed.customToolIdea === "string" ? parsed.customToolIdea : DEFAULT_PITCH_SETTINGS.customToolIdea,
        similarCompanyProof: typeof parsed.similarCompanyProof === "string" ? parsed.similarCompanyProof : DEFAULT_PITCH_SETTINGS.similarCompanyProof,
        deliveryDays: Number.isFinite(parsed.deliveryDays) && Number(parsed.deliveryDays) > 0
          ? Number(parsed.deliveryDays)
          : DEFAULT_PITCH_SETTINGS.deliveryDays,
        demoOffer:
          typeof parsed.demoOffer === "string" && parsed.demoOffer !== "45 sec Loom demo"
            ? parsed.demoOffer
            : DEFAULT_PITCH_SETTINGS.demoOffer,
        geminiApiKey: typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : undefined,
        openrouterApiKey: typeof parsed.openrouterApiKey === "string" ? parsed.openrouterApiKey : undefined,
      };
      setPitchSettings(normalized);
      const savedTheme = localStorage.getItem("startupsniper_theme");
      if (savedTheme === "light") {
        setDarkMode(false);
        document.documentElement.classList.remove("dark");
      } else if (savedTheme === "dark") {
        setDarkMode(true);
        document.documentElement.classList.add("dark");
      } else {
        // Start in the calm, high-contrast light theme; users can opt into dark mode.
        setDarkMode(false);
        document.documentElement.classList.remove("dark");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("startupsniper_theme", next ? "dark" : "light");
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 180);
    return () => clearTimeout(t);
  }, [filters.search]);

  const fetchCompaniesPage = useCallback(
    async (targetPage: number, append: boolean) => {
      const requestId = ++latestCompaniesRequest.current;
      setSyncStatusText((current) =>
        current === "Refreshing today's startups in the background."
          ? null
          : current
      );
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          source: activeSection === "indie" ? "all" : filters.source,
          batch: activeSection === "indie" ? "all" : filters.batch,
          ats: activeSection === "indie" ? "all" : filters.ats,
          pipeline: activeSection === "indie" ? "all" : filters.pipeline,
          funded12mo: String(activeSection === "indie" ? false : filters.funded12mo),
          fresh14d: String(activeSection === "indie" ? false : filters.fresh14d),
          indiaOnly: String(activeSection === "indie" ? false : filters.indiaOnly),
          fresherOnly: String(activeSection === "indie" ? false : filters.fresherOnly),
          remote: String(activeSection === "indie" ? false : filters.remote),
          hiring: String(activeSection === "indie" ? false : filters.hiring),
          smallTeam: String(activeSection === "indie" ? false : filters.smallTeam),
          launchOnly: String(activeSection === "indie"),
          launchWindow: activeSection === "indie" ? launchWindow : "all",
          earningOnly: String(activeSection === "indie" && earningOnly),
          sort: activeSection === "indie" ? "launchDate" : filters.sort,
          search: debouncedSearch,
          page: String(targetPage),
          limit: "48",
        });

        const res = await fetch(`/api/companies?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const failure = await res.json().catch(() => null);
          throw new Error(
            typeof failure?.error === "string"
              ? failure.error
              : `HTTP ${res.status}`
          );
        }
        const data = (await res.json()) as CompaniesApiResponse;
        // Visibility changes, filter edits, and initial mount can overlap. Only
        // the newest response is allowed to replace the dashboard snapshot.
        if (requestId !== latestCompaniesRequest.current) return false;

        setCompanies((prev) =>
          append ? [...prev, ...data.companies] : data.companies
        );
        setStats(data.stats);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(data.page);
        if (!append && data.stats.totalCompanies === 0) {
          const unavailableSources = data.stats.lastSyncSummary
            .filter((source) => source.mode === "unavailable" || source.error)
            .map((source) => source.source);
          setSyncStatusText(
            unavailableSources.length > 0
              ? `No startups loaded. Unavailable feeds: ${unavailableSources.join(", ")}. Open Sources for details.`
              : "No startup records are available. Open Sources for feed status or run Force Sync."
          );
        }

        return true;
      } catch (err) {
        console.error("Failed loading startups:", err);
        const reason = getErrorMessage(err);
        setSyncStatusText(
          `Dashboard data error: ${reason}`
        );
        return false;
      } finally {
        if (requestId === latestCompaniesRequest.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      filters.source,
      filters.batch,
      filters.ats,
      filters.pipeline,
      filters.funded12mo,
      filters.fresh14d,
      filters.indiaOnly,
      filters.fresherOnly,
      filters.remote,
      filters.hiring,
      filters.smallTeam,
      filters.sort,
      debouncedSearch,
      activeSection,
      launchWindow,
      earningOnly,
    ]
  );

  useEffect(() => {
    fetchCompaniesPage(1, false);
  }, [fetchCompaniesPage]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchCompaniesPage(1, false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchCompaniesPage]);

  const handleSyncLive = async (force: boolean) => {
    if (syncing) return;
    setSyncing(true);
    setSyncStatusText(
      force
        ? "Fetching every source from upstream, cache ignored."
        : "Fetching all seven sources..."
    );

    try {
      const syncRes = await fetch(
        `/api/sync?mode=sources&force=${force ? "1" : "0"}`,
        { method: "POST" }
      );
      if (!syncRes.ok) {
        const failure = await syncRes.json().catch(() => null);
        throw new Error(
          typeof failure?.error === "string"
            ? failure.error
            : `Sync API returned ${syncRes.status}`
        );
      }
      const syncJson = await syncRes.json();
      if (syncJson.skipped) {
        const seconds = Math.ceil(Number(syncJson.retryAfterMs || 0) / 1000);
        setSyncStatusText(
          `Sync skipped to protect D1 and upstream rate limits. Try again in about ${seconds}s; no feeds were requested.`
        );
        await fetchCompaniesPage(1, false);
        return;
      }

      const upserted = Number(syncJson.upsertedCount ?? 0).toLocaleString();
      const totalAfterSync = Number(syncJson.stats?.totalCompanies ?? -1);
      const failedSources = (syncJson.sources || [])
        .filter((source: { mode?: string; error?: string }) =>
          source.mode === "unavailable" || Boolean(source.error)
        )
        .map((source: { source?: string }) => source.source)
        .filter(Boolean);
      setSyncStatusText(
        `Sync wrote ${upserted} changed companies in ${syncJson.durationMs}ms.`
      );

      const refreshedSuccessfully = await fetchCompaniesPage(1, false);
      if (!refreshedSuccessfully) return;
      if (totalAfterSync === 0) {
        setSyncStatusText(
          "Sync checked the feeds, but D1 has no startup records. Open Sources for feed errors."
        );
      } else if (failedSources.length > 0) {
        setSyncStatusText(
          `Sync finished with unavailable feeds: ${failedSources.join(", ")}. Existing D1 records were kept; open Sources for details.`
        );
      } else {
        setSyncStatusText("All sources checked; hiring-board checks are manual.");
        setTimeout(() => setSyncStatusText(null), 4000);
      }
    } catch (err) {
      console.error("Live sync failed:", err);
      const reason = getErrorMessage(err);
      setSyncStatusText(
        `Live sync failed: ${reason}`
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectQuickLens = (lens: string) => {
    setActiveLens(lens);
    if (lens === "all") {
      setFilters({ ...DEFAULT_FILTERS, funded12mo: false });
    } else if (lens === "funded12mo") {
      setFilters({ ...DEFAULT_FILTERS, funded12mo: true });
    } else if (lens === "hiring") {
      setFilters({ ...DEFAULT_FILTERS, funded12mo: true, hiring: true });
    } else if (lens === "remote") {
      setFilters({ ...DEFAULT_FILTERS, funded12mo: true, remote: true });
    } else if (lens === "hot") {
      setFilters({
        ...DEFAULT_FILTERS,
        funded12mo: true,
        hiring: true,
        smallTeam: true,
        sort: "score",
      });
    } else if (lens === "pipeline") {
      setFilters({
        ...DEFAULT_FILTERS,
        funded12mo: false,
        pipeline: "saved",
      });
    }
  };

  const handleUpdateCompanyStatus = async (
    companyId: string,
    status: OutreachStatus
  ) => {
    setCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId ? { ...c, outreach_status: status } : c
      )
    );
    const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outreach_status: status }),
    });
    if (res.ok) {
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) setStats(await statsRes.json());
    }
  };

  const handleCompanyUpdated = (updated: Company) => {
    setSelectedCompany(updated);
    setCompanies((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleCheckCompanyContacts = async (companyId: string) => {
    const response = await fetch(
      `/api/companies/${encodeURIComponent(companyId)}/enrich`,
      { method: "POST" }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.company) {
      throw new Error(data?.error || `Company check failed (${response.status})`);
    }
    const updated = data.company as Company;
    setCompanies((prev) => prev.map((item) => item.id === updated.id ? updated : item));
    setSelectedCompany((current) => current?.id === updated.id ? updated : current);
    return {
      skipped: Boolean(data.skipped),
      checked: Boolean(data.contactPageChecked),
      found: Boolean(updated.company_email || updated.company_linkedin_url),
    };
  };

  const handleSavePitchSettings = (next: PitchSettings) => {
    setPitchSettings(next);
    try {
      localStorage.setItem(STORAGE_PITCH_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Name",
      "Domain",
      "Website",
      "Batch",
      "Source",
      "Sniper Score",
      "Team Size",
      "Remote",
      "Funding",
      "ATS Provider",
      "Open Roles",
      "Hiring URL",
      "Founder Name",
      "Founder X",
      "Founder LinkedIn",
      "Founder Email",
      "Launch Date",
      "Launch Source",
      "Launch URL",
      "TrustMRR MRR (USD)",
      "TrustMRR Receipts Last 30d (USD)",
      "TrustMRR Lifetime Revenue (USD)",
      "CRM Status",
    ];
    const rows = companies.map((c) => [
        c.name,
        c.domain,
        c.website,
        c.batch || "",
        c.sources.join("+"),
        String(c.sniper_score),
        c.team_size ? String(c.team_size) : "",
        c.is_remote ? "Yes" : "No",
        c.funding_amount || "",
        c.hiring_provider || "",
        String(c.open_roles_count),
        c.hiring_page_url || "",
        c.founder_name || "",
        c.founder_twitter || "",
        c.founder_linkedin || "",
        c.founder_email || "",
        c.launch_date || "",
        c.launch_source || "",
        c.launch_url || "",
        c.trustmrr_mrr ?? "",
        c.trustmrr_last30 ?? "",
        c.trustmrr_total ?? "",
        c.outreach_status,
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`));

    const csvContent =
      headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `startupsniper-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterLabels = activeSection === "indie"
    ? [
        `Listed in the last ${launchWindow === "1d" ? "1 day" : launchWindow === "7d" ? "1 week" : launchWindow === "30d" ? "1 month" : "1 year"}`,
        ...(earningOnly ? ["Positive TrustMRR revenue evidence"] : []),
        ...(filters.search.trim() ? [`Search: “${filters.search.trim()}”`] : []),
      ]
    : getActiveFilterLabels(filters);
  const hasFilteredEmptyState = total === 0 && activeFilterLabels.length > 0;
  const trustMrrSummary = stats?.lastSyncSummary.find((summary) => summary.source === "trustmrr");

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-cream)] text-[var(--text-warm)] font-sans">
      <HeaderBar
        stats={stats}
        syncing={syncing}
        syncStatusText={syncStatusText}
        darkMode={darkMode}
        onToggleDarkMode={toggleTheme}
        onSyncLive={handleSyncLive}
        onOpenSources={() => setSourcesOpen(true)}
        onOpenPitchSettings={() => setPitchModalOpen(true)}
        onExportCsv={handleExportCsv}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col gap-3 border-b border-[var(--border-soft)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Workspace · Live signals</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-warm)]">
              {activeSection === "indie" ? "Indie launch radar" : "Find jobs and research companies"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              {activeSection === "indie"
                ? "New products, source listings, and verified revenue evidence."
                : "Start with India-eligible and Fresher keywords, then open a company and review its jobs. Filters match company records, not necessarily the same role. Confirm the location, experience, closing status and application link at the original source before applying."}
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card)] px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
            <span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-amber-500" : "bg-lime-600 dark:bg-lime-300"}`} />
            {loading ? "Updating results…" : `${total.toLocaleString()} matching records`}
          </div>
        </div>

        <div className="flex w-fit items-center gap-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-card)] p-1 shadow-sm">
          {([
            ["leads", "Startup & funding leads"],
            ["indie", "Indie launches"],
          ] as const).map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-pressed={activeSection === section}
              onClick={() => {
                setActiveSection(section);
                setActiveLens("all");
              }}
              className={`rounded-xl px-4 py-2.5 text-xs transition ${
                activeSection === section
                  ? "bg-[var(--pastel-peach)]/35 font-semibold text-[var(--text-warm)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-warm)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeSection === "indie" ? (
          <IndieLaunchControls
            window={launchWindow}
            earningOnly={earningOnly}
            total={total}
            search={filters.search}
            onSearchChange={(search) => setFilters((prev) => ({ ...prev, search }))}
            onWindowChange={setLaunchWindow}
            onEarningOnlyChange={setEarningOnly}
            onOpenSources={() => setSourcesOpen(true)}
          />
        ) : (
          <>
            <KpiStrip
              stats={stats}
              activeQuickLens={activeLens}
              onSelectLens={handleSelectQuickLens}
            />
            <FilterBar
              filters={filters}
              stats={stats}
              totalResults={total}
              onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
              onReset={() => {
                setActiveLens("all");
                setFilters(DEFAULT_FILTERS);
              }}
            />
          </>
        )}

        {/* Startup Cards Grid */}
        <AnimatePresence>
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4"
            >
              {Array.from({ length: 6 }).map((_, idx) => (
                <motion.div
                  key={idx}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="h-64 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] p-6 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--pastel-lavender)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-[var(--pastel-butter)] rounded" />
                      <div className="h-3 w-32 bg-[var(--pastel-butter)]/60 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-[var(--pastel-peach)/40] rounded" />
                    <div className="h-4 w-3/4 bg-[var(--pastel-peach)/40] rounded" />
                  </div>
                  <div className="h-8 w-24 rounded-xl bg-[var(--pastel-mint)] mt-4" />
                </motion.div>
              ))}
            </motion.div>
          ) : companies.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] p-8 sm:p-12 text-center space-y-4"
            >
              <Crosshair className="w-10 h-10 text-[var(--accent)] mx-auto" />
              <h3 className="text-lg font-semibold text-[var(--text-warm)]">
                {activeSection === "indie" && !syncStatusText?.startsWith("Dashboard data error:")
                  ? "No indie launches match this window"
                  : syncStatusText?.startsWith("Dashboard data error:")
                  ? "Could not load the company list"
                  : hasFilteredEmptyState
                    ? "No leads match the active filters"
                    : stats && stats.totalCompanies > 0
                      ? "No leads in this view"
                      : "No startup records loaded"}
              </h3>
              {syncStatusText?.startsWith("Dashboard data error:") ? (
                <p className="text-sm text-amber-400 max-w-md mx-auto">
                  {syncStatusText.replace("Dashboard data error: ", "")}. Retry the dashboard request or inspect source status.
                </p>
              ) : hasFilteredEmptyState ? (
                <>
                  <p className="text-sm text-[var(--text-muted)] max-w-xl mx-auto">
                    {activeSection === "indie" && earningOnly
                      ? `No matching product with positive TrustMRR-reported MRR, last-30-day receipts, or lifetime revenue is currently stored for this time window. Revenue is never estimated. ${trustMrrSummary?.note || "Run Sync launch feeds and check TrustMRR source status for API or public-scrape availability."}`
                      : (stats?.totalCompanies || 0) > 0
                        ? `D1 has ${stats!.totalCompanies.toLocaleString()} tracked startups, but none match this filter combination. This filtered zero does not by itself mean the API is down.`
                        : "D1 currently has no active startup records. These filters also narrow the view; clear them, then check feed status before forcing another sync."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
                    {activeFilterLabels.map((label) => (
                      <span key={label} className="px-2.5 py-1 rounded-full text-[10px] border border-[var(--pastel-peach)]/30 bg-[var(--pastel-peach)]/20 text-[var(--text-warm)]">
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                  No company records are currently available. Check the feed status before forcing another upstream request.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {activeSection === "indie" && (
                  <button
                    type="button"
                    onClick={() => handleSyncLive(false)}
                    disabled={syncing}
                    className="px-5 py-2.5 rounded-2xl text-xs font-semibold bg-[var(--pastel-peach)] text-[var(--text-warm)] hover:bg-[var(--pastel-butter)] transition shadow-[0_4px_16px_-4px_rgba(42,83,59,0.12)]"
                  >
                    Sync launch feeds
                  </button>
                )}
                {hasFilteredEmptyState ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({ ...DEFAULT_FILTERS, funded12mo: false });
                      setLaunchWindow("365d");
                      setEarningOnly(false);
                      setActiveLens("all");
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition"
                  >
                    Clear filters
                  </button>
                ) : syncStatusText?.startsWith("Dashboard data error:") ? (
                  <button
                    type="button"
                    onClick={() => fetchCompaniesPage(1, false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition"
                  >
                    Retry dashboard
                  </button>
                ) : stats?.totalCompanies === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleSyncLive(false)}
                    disabled={syncing}
                    className="px-5 py-2.5 rounded-2xl text-xs font-semibold bg-[var(--pastel-peach)] text-[var(--text-warm)] hover:bg-[var(--pastel-butter)] transition shadow-[0_4px_16px_-4px_rgba(42,83,59,0.12)]"
                  >
                    Sync live feeds
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSourcesOpen(true)}
                  className="px-5 py-2.5 rounded-2xl text-xs font-medium border border-[var(--pastel-mint)]/40 bg-[var(--pastel-mint)]/10 text-[var(--text-warm)] hover:bg-[var(--pastel-mint)]/20 transition"
                >
                  Check feed status
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {companies.map((company) => (
                <motion.div
                  key={company.id}
                  layout
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ y: -4 }}
                  className="cursor-pointer group"
                >
                  <CompanyCard
                    company={company}
                    pitchSettings={pitchSettings}
                    onSelect={setSelectedCompany}
                    onUpdateStatus={handleUpdateCompanyStatus}
                    onCheckCompanyContacts={handleCheckCompanyContacts}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {hasMore && (
          <div className="pt-4 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => fetchCompaniesPage(page + 1, true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-semibold bg-[var(--surface-white)] border border-[var(--pastel-butter)]/40 hover:border-[var(--pastel-peach)]/50 hover:bg-[var(--pastel-peach)]/10 shadow-[0_6px_20px_-8px_rgba(42,83,59,0.10)] transition-all"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading more startups...
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-[var(--pastel-amber)]" />
                  Load More ({companies.length} of {total.toLocaleString()})
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* Company drawer */}
      {selectedCompany && (
        <CompanyDrawer
          company={selectedCompany}
          pitchSettings={pitchSettings}
          onClose={() => setSelectedCompany(null)}
          onCompanyUpdated={handleCompanyUpdated}
          onCheckCompanyContacts={handleCheckCompanyContacts}
          onOpenAIJobHunt={() => {
            if (selectedCompany) setAiJobHuntCompany(selectedCompany);
          }}
          onOpenPitchSettings={() => setPitchModalOpen(true)}
        />
      )}

      {/* AI job hunt drawer */}
      {aiJobHuntCompany && (
        <AIJobHuntDrawer
          company={aiJobHuntCompany}
          pitchSettings={pitchSettings}
          onClose={() => setAiJobHuntCompany(null)}
          onOpenPitchSettings={() => {
            setAiJobHuntCompany(null);
            setPitchModalOpen(true);
          }}
        />
      )}

      <SourceHealthPopover
        isOpen={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        summaries={stats?.lastSyncSummary || []}
        bySource={stats?.bySource || {}}
        lastSyncedAt={stats?.lastSyncedAt || null}
      />

      <PitchSettingsModal
        isOpen={pitchModalOpen}
        settings={pitchSettings}
        onSave={handleSavePitchSettings}
        onClose={() => setPitchModalOpen(false)}
      />
    </div>
  );
}
