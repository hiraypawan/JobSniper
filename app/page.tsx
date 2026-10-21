"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, Crosshair, RefreshCw } from "lucide-react";
import { CompanyCard } from "@/components/CompanyCard";
import { CompanyDrawer } from "@/components/CompanyDrawer";
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
  funded12mo: true, // Spec requirement: Funded last 12mo ON by default
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
  const [activeLens, setActiveLens] = useState("funded12mo");

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pitchModalOpen, setPitchModalOpen] = useState(false);
  const [pitchSettings, setPitchSettings] = useState<PitchSettings>(
    DEFAULT_PITCH_SETTINGS
  );
  const [darkMode, setDarkMode] = useState(true);

  // Hydrate theme + saved global offer settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PITCH_KEY);
      if (saved) {
        setPitchSettings({
          ...DEFAULT_PITCH_SETTINGS,
          ...JSON.parse(saved),
        });
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  // Debounce search query smoothly
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

        const res = await fetch(`/api/companies?${params.toString()}`);
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
          setSyncStatusText(
            "Auto-refreshing today's live startups in background..."
          );
          setTimeout(async () => {
            try {
              const refreshed = await fetch(
                `/api/companies?${params.toString()}`
              );
              if (refreshed.ok) {
                const freshData =
                  (await refreshed.json()) as CompaniesApiResponse;
                setCompanies(freshData.companies);
                setStats(freshData.stats);
                setTotal(freshData.total);
                setHasMore(freshData.hasMore);
              }
              setSyncStatusText("Feed auto-synced with latest live startups ✓");
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

  // Hands-free daily freshness: auto-revalidate whenever tab regains focus on a new day / session
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchCompaniesPage(1, false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchCompaniesPage]);

  // Unlimited On-Demand Live Worker Sync + Bounded Multi-Batch ATS Enrichment
  const handleSyncLive = async (force: boolean) => {
    if (syncing) return;
    setSyncing(true);
    setSyncStatusText(
      force
        ? "Force-fetching all 6 live startup feeds directly from upstream..."
        : "Syncing live startup feeds in parallel..."
    );

    try {
      const syncRes = await fetch(
        `/api/sync?mode=sources&force=${force ? "1" : "0"}`,
        { method: "POST" }
      );
      if (syncRes.ok) {
        const syncJson = await syncRes.json();
        setSyncStatusText(
          `Synced ${syncJson.upsertedCount?.toLocaleString() || ""} unique startups in ${syncJson.durationMs}ms · Enriching live ATS job boards...`
        );
      }

      await fetchCompaniesPage(1, false);

      // Run 2 bounded Worker enrichment batches (respecting Cloudflare's 50-subrequest limit per call!)
      for (let step = 1; step <= 2; step++) {
        const enr = await fetch("/api/sync?mode=enrich&batchSize=12", {
          method: "POST",
        });
        if (!enr.ok) break;
        const enrJson = await enr.json();
        if (enrJson.stats) setStats(enrJson.stats);
        if (!enrJson.enriched || enrJson.remaining === 0) break;
        setSyncStatusText(
          `ATS & social enrichment pass ${step}/2 complete · Live feed up to date!`
        );
      }

      await fetchCompaniesPage(1, false);
      setSyncStatusText("All 6 live sources & ATS boards up to date!");
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
    // Instant optimistic UI update
    setCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId ? { ...c, outreach_status: status } : c
      )
    );
    const res = await fetch(
      `/api/companies/${encodeURIComponent(companyId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreach_status: status }),
      }
    );
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
    <div className="min-h-screen flex flex-col">
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

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
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
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="h-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-obsidian-900 p-4 animate-pulse flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-obsidian-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 w-36 bg-slate-200 dark:bg-obsidian-800 rounded" />
                    <div className="h-2.5 w-24 bg-slate-200 dark:bg-obsidian-800 rounded" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full bg-slate-200 dark:bg-obsidian-800 rounded" />
                  <div className="h-3 w-4/5 bg-slate-200 dark:bg-obsidian-800 rounded" />
                </div>
                <div className="h-8 w-28 bg-slate-200 dark:bg-obsidian-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-obsidian-900 p-12 text-center space-y-3">
            <Crosshair className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-base font-semibold">
              No startups matched these exact filters
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Try clearing your search term, toggling off strict filters, or run
              a fresh Live Worker sync.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-950"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => handleSyncLive(true)}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700"
              >
                Force Live Sync
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {companies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  pitchSettings={pitchSettings}
                  onSelect={setSelectedCompany}
                  onUpdateStatus={handleUpdateCompanyStatus}
                />
              ))}
            </div>

            {hasMore && (
              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => fetchCompaniesPage(page + 1, true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 shadow-xs transition"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
          </>
        )}
      </main>

      <CompanyDrawer
        company={selectedCompany}
        pitchSettings={pitchSettings}
        onClose={() => setSelectedCompany(null)}
        onCompanyUpdated={handleCompanyUpdated}
      />

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
