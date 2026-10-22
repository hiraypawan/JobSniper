import { WorkerEnv, WorkerExecutionContext } from "@/lib/cf-types";
import { CompaniesApiResponse, OutreachStatus } from "@/lib/types";
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
import { handleAiRequest } from "@/app/api/ai/utils";

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
    // 1. GET /api/stats — real-time dashboard counts & source sync health
    if (pathname === "/api/stats" && request.method === "GET") {
      const stats = await getDashboardStats(env);
      return jsonResponse(stats);
    }

    // 2. POST /api/sync — Unlimited on-demand Live Worker refresh & bounded ATS enrichment
    if (pathname === "/api/sync" && request.method === "POST") {
      const mode = url.searchParams.get("mode") || "sources";
      const forceLive = parseBoolParam(url.searchParams.get("force"), false);

      if (mode === "enrich") {
        const batchSize = Number(url.searchParams.get("batchSize") || 12);
        const enrichRes = await enrichCompanyBatch(env, batchSize);
        const stats = await getDashboardStats(env);
        return jsonResponse({
          ok: true,
          mode: "enrich",
          ...enrichRes,
          stats,
        });
      }

      const syncRes = await syncAllSources(env, { forceLive });
      let enrichRes = { enriched: 0, remaining: 0 };
      if (mode === "full") {
        enrichRes = await enrichCompanyBatch(env, 10);
      }
      const stats = await getDashboardStats(env);

      return jsonResponse({
        ok: true,
        mode,
        ...syncRes,
        ...enrichRes,
        stats,
      });
    }

    // 3. GET /api/companies — Instant query + automatic Stale-While-Revalidate live sync!
    if (pathname === "/api/companies" && request.method === "GET") {
      let stats = await getDashboardStats(env);
      let backgroundSyncTriggered = false;

      // First boot cold start: populate synchronously once so the very first visit already has ~1,000 startups!
      if (stats.totalCompanies === 0) {
        await syncAllSources(env, { forceLive: false });
        stats = await getDashboardStats(env);
      } else {
        // Stale-While-Revalidate (>15 mins old): respond immediately in <30ms AND refresh live in background!
        const lastMs = stats.lastSyncedAt
          ? Date.parse(stats.lastSyncedAt)
          : 0;
        const isStale = Date.now() - lastMs > 15 * 60 * 1000;
        if (isStale) {
          backgroundSyncTriggered = true;
          const bgTask = syncAllSources(env, { forceLive: false }).catch(
            () => undefined
          );
          if (ctx?.waitUntil) {
            ctx.waitUntil(bgTask);
          }
        }
      }

      const queryResult = await queryCompanies(env, {
        source: url.searchParams.get("source") || "all",
        batch: url.searchParams.get("batch") || "all",
        ats: url.searchParams.get("ats") || "all",
        pipeline: url.searchParams.get("pipeline") || "all",
        funded12mo: parseBoolParam(url.searchParams.get("funded12mo"), false),
        fresh14d: parseBoolParam(url.searchParams.get("fresh14d"), false),
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
        backgroundSyncTriggered,
      };
      return jsonResponse(payload);
    }

    // 4. POST /api/companies/:id/enrich — Instant live ATS + homepage check on drawer click
    const enrichMatch = pathname.match(/^\/api\/companies\/([^/]+)\/enrich$/);
    if (enrichMatch && request.method === "POST") {
      const id = decodeURIComponent(enrichMatch[1]);
      const result = await enrichSingleCompany(env, id);
      if (!result.company) {
        return jsonResponse({ error: "Company not found" }, 404);
      }
      return jsonResponse(result);
    }

    // 5. GET or PATCH /api/companies/:id — Single company detail + CRM pipeline persistence
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
        return jsonResponse({ company: updated });
      }
    }

    // 6. POST /api/ai — server-side AI proxy (OpenRouter / Gemini).
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
