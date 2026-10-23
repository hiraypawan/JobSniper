import { WorkerEnv, WorkerExecutionContext } from "@/lib/cf-types";
import { CompaniesApiResponse, DashboardStats, OutreachStatus } from "@/lib/types";
import {
  getCompanyById,
  getDashboardStats,
  queryCompanies,
  updateCompanyOutreach,
} from "@/workers/db";
import {
  enrichCompanyBatch,
  enrichSingleCompany,
  syncAllSources,
} from "@/workers/scheduled";
import { handleAiRequest } from "@/lib/aiProxy";

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function parseBoolParam(
  val: string | null,
  defaultValue: boolean = false
): boolean {
  if (val === null || val === undefined || val === "") return defaultValue;
  return val === "true" || val === "1";
}

let dashboardStatsCache: {
  db: WorkerEnv["DB"];
  expiresAt: number;
  value: DashboardStats;
} | null = null;
const DASHBOARD_STATS_CACHE_MS = 10_000;

async function getCachedDashboardStats(env: WorkerEnv): Promise<DashboardStats> {
  if (
    dashboardStatsCache?.db === env.DB &&
    dashboardStatsCache.expiresAt > Date.now()
  ) {
    return dashboardStatsCache.value;
  }
  const value = await getDashboardStats(env);
  dashboardStatsCache = {
    db: env.DB,
    expiresAt: Date.now() + DASHBOARD_STATS_CACHE_MS,
    value,
  };
  return value;
}

function invalidateDashboardStatsCache(): void {
  dashboardStatsCache = null;
}

export async function handleApiRequest(
  request: Request,
  env: WorkerEnv,
  ctx?: WorkerExecutionContext
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  try {
    // 1. GET /api/stats: dashboard counts and per source sync health
    if (pathname === "/api/stats" && request.method === "GET") {
      invalidateDashboardStatsCache();
      const stats = await getCachedDashboardStats(env);
      return jsonResponse(stats);
    }

    // 2. POST /api/sync: run the fetchers, then a bounded ATS enrichment pass
    if (pathname === "/api/sync" && request.method === "POST") {
      const mode = url.searchParams.get("mode") || "sources";
      const forceLive = parseBoolParam(url.searchParams.get("force"), false);

      if (mode === "enrich") {
        const batchSize = Number(url.searchParams.get("batchSize") || 12);
        const enrichRes = await enrichCompanyBatch(env, batchSize);
        invalidateDashboardStatsCache();
        const stats = await getCachedDashboardStats(env);
        return jsonResponse({
          ok: true,
          mode: "enrich",
          ...enrichRes,
          stats,
        });
      }

      const syncRes = await syncAllSources(env, { forceLive });
      let enrichRes = { enriched: 0, remaining: 0 };
      if (mode === "full" && !syncRes.skipped) {
        enrichRes = await enrichCompanyBatch(env, 10);
      }
      invalidateDashboardStatsCache();
      const stats = await getCachedDashboardStats(env);

      return jsonResponse({
        ok: true,
        mode,
        ...syncRes,
        ...enrichRes,
        stats,
      });
    }

    // 3. GET /api/companies: read dashboard data from D1 without triggering a sync
    if (pathname === "/api/companies" && request.method === "GET") {
      // Keep dashboard reads read-only. D1 charges row writes on every upsert,
      // so source syncs run only from explicit POST /api/sync requests.
      const stats = await getCachedDashboardStats(env);
      const queryResult = await queryCompanies(env, {
        source: url.searchParams.get("source") || "all",
        batch: url.searchParams.get("batch") || "all",
        ats: url.searchParams.get("ats") || "all",
        pipeline: url.searchParams.get("pipeline") || "all",
        funded12mo: parseBoolParam(url.searchParams.get("funded12mo"), false),
        fresh14d: parseBoolParam(url.searchParams.get("fresh14d"), false),
        launchOnly: parseBoolParam(url.searchParams.get("launchOnly"), false),
        launchWindow: url.searchParams.get("launchWindow") || "all",
        earningOnly: parseBoolParam(url.searchParams.get("earningOnly"), false),
        remote: parseBoolParam(url.searchParams.get("remote"), false),
        hiring: parseBoolParam(url.searchParams.get("hiring"), false),
        smallTeam: parseBoolParam(url.searchParams.get("smallTeam"), false),
        search: url.searchParams.get("search") || "",
        sort: url.searchParams.get("sort") || "score",
        page: Number(url.searchParams.get("page") || 1),
        limit: Number(url.searchParams.get("limit") || 48),
      });

      const payload: CompaniesApiResponse = {
        ...queryResult,
        stats,
        backgroundSyncTriggered: false,
      };
      return jsonResponse(payload);
    }

    // 4. POST /api/companies/:id/enrich: check this one site and job board now
    const enrichMatch = pathname.match(/^\/api\/companies\/([^/]+)\/enrich$/);
    if (enrichMatch && request.method === "POST") {
      const id = decodeURIComponent(enrichMatch[1]);
      const result = await enrichSingleCompany(env, id, { cooldownMs: 30 * 60 * 1000 });
      if (!result.company) {
        return jsonResponse({ error: "Company not found" }, 404);
      }
      invalidateDashboardStatsCache();
      return jsonResponse(result);
    }

    // 5. GET or PATCH /api/companies/:id: one company, plus CRM status and notes
    const itemMatch = pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]);
      if (request.method === "GET") {
        const company = await getCompanyById(env, id);
        if (!company) {
          return jsonResponse({ error: "Company not found" }, 404);
        }
        return jsonResponse({ company });
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as {
          outreach_status?: OutreachStatus;
          outreach_notes?: string;
        };
        const updated = await updateCompanyOutreach(env, id, body);
        if (!updated) {
          return jsonResponse({ error: "Company not found" }, 404);
        }
        invalidateDashboardStatsCache();
        return jsonResponse({ company: updated });
      }
    }

    // 6. POST /api/ai: server side AI proxy for OpenRouter or Gemini.
    // Uses the server key from env when set (shared team key, never exposed to
    // the browser); otherwise falls back to a client key forwarded in the body.
    if (pathname === "/api/ai" && request.method === "POST") {
      return handleAiRequest(request, {
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      });
    }

    return jsonResponse({ error: `Not found: ${pathname}` }, 404);
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : "Internal Worker Error",
      },
      500
    );
  }
}
