import {
  ScheduledController,
  WorkerEnv,
  WorkerExecutionContext,
} from "@/lib/cf-types";
import { computeSniperScore } from "@/lib/scoring";
import {
  Company,
  FetcherResult,
  NormalizedCompanyInput,
  SyncSourceSummary,
} from "@/lib/types";
import {
  deduplicateAndUpsertCompanies,
  ensureSchema,
  getCompanyById,
  recordSyncRun,
} from "@/workers/db";
import { detectCompanyHiringAndSignals } from "@/workers/enrichment/hiringDetector";
import { fetchHnWhoIsHiring } from "@/workers/fetchers/hnHiring";
import { fetchIndieShowHn } from "@/workers/fetchers/indie";
import { fetchProductHuntLaunches } from "@/workers/fetchers/producthunt";
import { fetchWellfoundFunded } from "@/workers/fetchers/wellfound";
import { fetchWorkAtAStartup } from "@/workers/fetchers/workatastartup";
import { fetchYcCompanies } from "@/workers/fetchers/yc";

let activeSyncPromise: Promise<{
  upsertedCount: number;
  jobsUpsertedCount: number;
  durationMs: number;
  sources: SyncSourceSummary[];
}> | null = null;

export async function syncAllSources(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<{
  upsertedCount: number;
  jobsUpsertedCount: number;
  durationMs: number;
  sources: SyncSourceSummary[];
}> {
  if (activeSyncPromise && !options.forceLive) {
    return activeSyncPromise;
  }

  const runPromise = (async () => {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();
    await ensureSchema(env.DB);

    const fetcherTasks: Promise<FetcherResult>[] = [
      fetchYcCompanies(env, options),
      fetchWorkAtAStartup(env, options),
      fetchWellfoundFunded(env, options),
      fetchProductHuntLaunches(env, options),
      fetchIndieShowHn(env, options),
      fetchHnWhoIsHiring(env, options),
    ];

    const settled = await Promise.allSettled(fetcherTasks);
    const allCompanies: NormalizedCompanyInput[] = [];
    const summaries: SyncSourceSummary[] = [];

    for (const item of settled) {
      if (item.status === "fulfilled") {
        const res = item.value;
        allCompanies.push(...res.companies);
        const jobsCount = res.companies.reduce(
          (acc, c) => acc + (c.jobs?.length || 0),
          0
        );
        summaries.push({
          source: res.source,
          count: res.companies.length,
          jobsCount,
          durationMs: res.durationMs,
          mode: res.mode,
          note: res.note,
          error: res.error,
        });
      }
    }

    const { upsertedCount, jobsUpsertedCount } =
      await deduplicateAndUpsertCompanies(env, allCompanies);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;

    await recordSyncRun(env, {
      mode: options.forceLive ? "force_live" : "live_sync",
      startedAt,
      completedAt,
      durationMs,
      totalFetched: allCompanies.length,
      totalUpserted: upsertedCount,
      enrichedCount: 0,
      sourcesReport: summaries,
    });

    return {
      upsertedCount,
      jobsUpsertedCount,
      durationMs,
      sources: summaries,
    };
  })();

  activeSyncPromise = runPromise;
  try {
    return await runPromise;
  } finally {
    activeSyncPromise = null;
  }
}

export async function enrichSingleCompany(
  env: WorkerEnv,
  companyId: string
): Promise<{ company: Company | null; checkedLive: boolean }> {
  await ensureSchema(env.DB);
  const existing = await getCompanyById(env, companyId);
  if (!existing) {
    return { company: null, checkedLive: false };
  }

  const outcome = await detectCompanyHiringAndSignals(env, {
    id: existing.id,
    name: existing.name,
    website: existing.website,
    hiring_page_url: existing.hiring_page_url,
    hiring_provider: existing.hiring_provider,
    open_roles_count: existing.open_roles_count,
    existingJobs: existing.jobs,
  });

  const nowIso = new Date().toISOString();
  const mergedStack = Array.from(
    new Set([...(existing.tech_stack || []), ...outcome.tech_stack])
  );
  const nextTwitter = existing.founder_twitter || null;
  const nextLinkedin = existing.founder_linkedin || null;
  const nextEmail = existing.founder_email || null;

  const { score } = computeSniperScore({
    batch: existing.batch,
    last_funding_date: existing.last_funding_date,
    funding_amount: existing.funding_amount,
    is_funded_last_12mo: existing.is_funded_last_12mo,
    team_size: existing.team_size,
    open_roles_count: outcome.open_roles_count,
    hiring_provider: outcome.hiring_provider,
    is_remote: existing.is_remote,
    founder_name: existing.founder_name,
    founder_twitter: nextTwitter,
    founder_linkedin: nextLinkedin,
    founder_email: nextEmail,
    sources: existing.sources,
  });

  await env.DB.prepare(
    `UPDATE companies
     SET hiring_page_url = COALESCE(?, hiring_page_url),
         hiring_provider = COALESCE(?, hiring_provider),
         open_roles_count = ?,
         tech_stack_json = ?,
         founder_twitter = COALESCE(?, founder_twitter),
         founder_linkedin = COALESCE(?, founder_linkedin),
         founder_email = COALESCE(?, founder_email),
         sniper_score = ?,
         enriched_at = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      outcome.hiring_page_url,
      outcome.hiring_provider,
      outcome.open_roles_count,
      JSON.stringify(mergedStack),
      nextTwitter,
      nextLinkedin,
      nextEmail,
      score,
      nowIso,
      nowIso,
      companyId
    )
    .run();

  if (outcome.jobsVerified) {
    await env.DB.prepare("DELETE FROM jobs WHERE company_id = ?")
      .bind(companyId)
      .run();
  }

  if (outcome.jobs.length > 0) {
    const jobStmts = outcome.jobs.map((job) =>
      env.DB.prepare(
        `INSERT INTO jobs (id, company_id, title, url, location, remote, department, description, posted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           url = excluded.url,
           location = COALESCE(excluded.location, jobs.location),
           remote = MAX(jobs.remote, excluded.remote),
           description = COALESCE(excluded.description, jobs.description)`
      ).bind(
        job.id,
        companyId,
        job.title,
        job.url,
        job.location ?? null,
        job.remote ? 1 : 0,
        job.department ?? null,
        job.description ?? null,
        job.posted_at ?? null,
        nowIso
      )
    );
    await env.DB.batch(jobStmts);
  }

  const updated = await getCompanyById(env, companyId);
  return { company: updated, checkedLive: outcome.checkedLive };
}

// Bounded batch enrichment (respects Cloudflare's 50 subrequest limit per Worker invocation!)
export async function enrichCompanyBatch(
  env: WorkerEnv,
  batchSize: number = 12
): Promise<{ enriched: number; remaining: number }> {
  await ensureSchema(env.DB);
  const safeLimit = Math.min(20, Math.max(1, batchSize));

  const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const candidates = await env.DB.prepare(
    `SELECT id FROM companies
     WHERE enriched_at IS NULL OR enriched_at <= ?
     ORDER BY sniper_score DESC, open_roles_count DESC
     LIMIT ?`
  )
    .bind(staleBefore, safeLimit)
    .all<{ id: string }>();

  const ids = (candidates.results || []).map((r) => r.id);
  await Promise.allSettled(ids.map((id) => enrichSingleCompany(env, id)));

  const remRow = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM companies WHERE enriched_at IS NULL OR enriched_at <= ?"
  )
    .bind(staleBefore)
    .first<{ cnt: number }>();

  return {
    enriched: ids.length,
    remaining: Number(remRow?.cnt || 0),
  };
}

// Optional Scheduled Handler (if Cron Trigger is kept enabled in wrangler.toml)
export async function runScheduledCron(
  _controller: ScheduledController,
  env: WorkerEnv,
  _ctx: WorkerExecutionContext
): Promise<void> {
  await syncAllSources(env, { forceLive: true });
  await enrichCompanyBatch(env, 12);
}
