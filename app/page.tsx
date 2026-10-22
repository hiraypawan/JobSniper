"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Crosshair, RefreshCw } from "lucide-react";
import { CompanyCard } from "@/components/CompanyCard";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { AIJobHuntDrawer } from "@/components/AIJobHuntDrawer";
import { FilterBar, FilterState } from "@/components/FilterBar";
import { HeaderBar } from "@/components/HeaderBar";
import { KpiStrip } from "@/components/KpiStrip";
import { PitchSettingsModal } from "@/components/PitchSettingsModal";
import { SourceHealthPopover } from "@/components/SourceHealthPopover";
import {
  buildOutreachPitches,
  DEFAULT_PITCH_SETTINGS,
} from "@/lib/pitchTemplates";
import {
  CompaniesApiResponse,
  Company,
  DashboardStats,
  OutreachStatus,
  PitchSettings,
} from "@/lib/types";

const DEFAULT_FILTERS: FilterState = {
  funded12mo: true,
  fresh14d: false,
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

const STORAGE_PITCH_KEY = "startupsniper_pitch_settings_v1";

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
  const [darkMode, setDarkMode] = useState(true);
  const [activeLens, setActiveLens] = useState("funded12mo");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PITCH_KEY);
      let parsed: Partial<PitchSettings> = saved ? JSON.parse(saved) : {};

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
        senderName: typeof parsed.senderName === "string" ? parsed.senderName : DEFAULT_PITCH_SETTINGS.senderName,
        customToolIdea: typeof parsed.customToolIdea === "string" ? parsed.customToolIdea : DEFAULT_PITCH_SETTINGS.customToolIdea,
        similarCompanyProof: typeof parsed.similarCompanyProof === "string" ? parsed.similarCompanyProof : DEFAULT_PITCH_SETTINGS.similarCompanyProof,
        deliveryDays: Number.isFinite(parsed.deliveryDays) && Number(parsed.deliveryDays) > 0
          ? Number(parsed.deliveryDays)
          : DEFAULT_PITCH_SETTINGS.deliveryDays,
        demoOffer: typeof parsed.demoOffer === "string" ? parsed.demoOffer : DEFAULT_PITCH_SETTINGS.demoOffer,
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
        // Respect system preference on first visit
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setDarkMode(prefersDark ? true : true); // default dark for branding
        document.documentElement.classList.toggle("dark", prefersDark || true);
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
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          source: filters.source,
          batch: filters.batch,
          ats: filters.ats,
          pipeline: filters.pipeline,
          funded12mo: String(filters.funded12mo),
          fresh14d: String(filters.fresh14d),
          remote: String(filters.remote),
          hiring: String(filters.hiring),
          smallTeam: String(filters.smallTeam),
          sort: filters.sort,
          search: debouncedSearch,
          page: String(targetPage),
          limit: "48",
        });

        const res = await fetch(`/api/companies?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CompaniesApiResponse;

        setCompanies((prev) =>
          append ? [...prev, ...data.companies] : data.companies
        );
        setStats(data.stats);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(data.page);

        if (data.backgroundSyncTriggered && !append) {
          setSyncStatusText("Refreshing today's startups in the background.");
          setTimeout(async () => {
            try {
              const refreshed = await fetch(
                `/api/companies?${params.toString()}`,
                { cache: "no-store" }
              );
              if (refreshed.ok) {
                const freshData =
                  (await refreshed.json()) as CompaniesApiResponse;
                setCompanies(freshData.companies);
                setStats(freshData.stats);
                setTotal(freshData.total);
                setHasMore(freshData.hasMore);
              }
              setSyncStatusText("Feed refreshed.");
              setTimeout(() => setSyncStatusText(null), 2500);
            } catch {
              setSyncStatusText(null);
            }
          }, 2200);
        }
      } catch (err) {
        console.error("Failed loading startups:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      filters.source,
      filters.batch,
      filters.ats,
      filters.pipeline,
      filters.funded12mo,
      filters.fresh14d,
      filters.remote,
      filters.hiring,
      filters.smallTeam,
      filters.sort,
      debouncedSearch,
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
        : "Fetching all six sources..."
    );

    try {
      const syncRes = await fetch(
        `/api/sync?mode=sources&force=${force ? "1" : "0"}`,
        { method: "POST" }
      );
      if (syncRes.ok) {
        const syncJson = await syncRes.json();
        const upserted = Number(syncJson.upsertedCount ?? 0).toLocaleString();
        setSyncStatusText(
          `Saved ${upserted} companies in ${syncJson.durationMs}ms. Checking job boards next.`
        );
      }

      await fetchCompaniesPage(1, false);

      for (let step = 1; step <= 2; step++) {
        const enr = await fetch("/api/sync?mode=enrich&batchSize=12", {
          method: "POST",
        });
        if (!enr.ok) break;
        const enrJson = await enr.json();
        if (enrJson.stats) setStats(enrJson.stats);
        if (!enrJson.enriched || enrJson.remaining === 0) break;
        setSyncStatusText(`Job board check ${step} of 2 done.`);
      }

      await fetchCompaniesPage(1, false);
      setSyncStatusText("All sources checked.");
      setTimeout(() => setSyncStatusText(null), 3000);
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
      "CRM Status",
      "Prefilled 5-Day Pitch",
    ];
    const rows = companies.map((c) => {
      const pitch = buildOutreachPitches(c, pitchSettings).classicSpecDm;
      return [
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
        c.outreach_status,
        pitch,
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
    });

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

  return (
    <div className={`min-h-screen flex flex-col selection:bg-emerald-500/25 ${darkMode ? "bg-obsidian-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
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
            setActiveLens("funded12mo");
            setFilters(DEFAULT_FILTERS);
          }}
        />

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
                  className="h-64 rounded-3xl border border-white/10 bg-white/5 p-6 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-slate-800 rounded" />
                      <div className="h-3 w-32 bg-slate-800 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-slate-800 rounded" />
                    <div className="h-4 w-3/4 bg-slate-800 rounded" />
                  </div>
                  <div className="h-8 w-24 rounded-xl bg-slate-800 mt-4" />
                </motion.div>
              ))}
            </motion.div>
          ) : companies.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center space-y-4"
            >
              <Crosshair className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-semibold text-slate-100">
                Nothing matched those filters
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Clear the search box, turn off a filter, or pull the feeds again.
                Some weeks are just quiet.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="px-5 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => handleSyncLive(true)}
                  className="ml-2 px-5 py-2.5 rounded-2xl text-xs font-medium border border-emerald-500/30 bg-white/5 text-emerald-400 hover:bg-emerald-500/10 transition"
                >
                  Sync again
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
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-semibold bg-white/5 dark:bg-obsidian-900 border border-white/10 dark:border-obsidian-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 shadow-xs transition-all"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading more startups...
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-emerald-500" />
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
