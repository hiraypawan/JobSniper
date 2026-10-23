import {
  ScheduledController,
  WorkerEnv,
  WorkerExecutionContext,
} from "@/lib/cf-types";
import { computeSniperScore } from "@/lib/scoring";
import {
  Company,
  CompanySource,
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

const SYNC_COOLDOWN_KEY = "api-source-sync-cooldown";
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

type SyncResult = {
  upsertedCount: number;
  jobsUpsertedCount: number;
  durationMs: number;
  sources: SyncSourceSummary[];
  skipped?: boolean;
  retryAfterMs?: number;
};

let activeSyncPromise: Promise<SyncResult> | null = null;

async function reserveSyncCooldown(
  env: WorkerEnv
): Promise<{ acquired: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = now + SYNC_COOLDOWN_MS;
  const result = await env.DB.prepare(
    `INSERT INTO http_cache (cache_key, payload, content_type, expires_at, updated_at)
     VALUES (?, 'reserved', 'text/plain', ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload = excluded.payload, expires_at = excluded.expires_at, updated_at = excluded.updated_at
     WHERE http_cache.expires_at <= ?`
  )
    .bind(SYNC_COOLDOWN_KEY, expiresAt, nowIso, now)
    .run();
  if ((result.meta?.changes || 0) > 0) {
    return { acquired: true, retryAfterMs: 0 };
  }
  const lock = await env.DB.prepare(
    "SELECT expires_at FROM http_cache WHERE cache_key = ?"
  )
    .bind(SYNC_COOLDOWN_KEY)
    .first<{ expires_at: number }>();
  return {
    acquired: false,
    retryAfterMs: Math.max(0, Number(lock?.expires_at || now) - now),
  };
}

export async function syncAllSources(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<SyncResult> {
  // Join any in-flight run, including Force, instead of launching duplicate work.
  if (activeSyncPromise) return activeSyncPromise;

  const runPromise = (async (): Promise<SyncResult> => {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();
    await ensureSchema(env.DB);
    const reservation = await reserveSyncCooldown(env);
    if (!reservation.acquired) {
      return {
        upsertedCount: 0,
        jobsUpsertedCount: 0,
        durationMs: Date.now() - startedMs,
        sources: [],
        skipped: true,
        retryAfterMs: reservation.retryAfterMs,
      };
    }

    const fetcherTasks: Array<{ source: CompanySource; run: Promise<FetcherResult> }> = [
      { source: "yc", run: fetchYcCompanies(env, options) },
      { source: "workatastartup", run: fetchWorkAtAStartup(env, options) },
      { source: "wellfound", run: fetchWellfoundFunded(env, options) },
      { source: "producthunt", run: fetchProductHuntLaunches(env, options) },
      { source: "indie", run: fetchIndieShowHn(env, options) },
      { source: "hn_hiring", run: fetchHnWhoIsHiring(env, options) },
    ];

    const settled = await Promise.allSettled(fetcherTasks.map((task) => task.run));
    const allCompanies: NormalizedCompanyInput[] = [];
    const summaries: SyncSourceSummary[] = [];

    settled.forEach((item, index) => {
      const expectedSource = fetcherTasks[index].source;
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
      } else {
        summaries.push({
          source: expectedSource,
          count: 0,
          jobsCount: 0,
          durationMs: Date.now() - startedMs,
          mode: "unavailable",
          note: "Fetch failed; existing D1 records were kept.",
          error: item.reason instanceof Error ? item.reason.message : String(item.reason),
        });
      }
    });

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
  companyId: string,
  options: { cooldownMs?: number } = {}
): Promise<{ company: Company | null; checkedLive: boolean; skipped?: boolean }> {
  await ensureSchema(env.DB);
  const existing = await getCompanyById(env, companyId);
  if (!existing) {
    return { company: null, checkedLive: false };
  }
  if (options.cooldownMs && existing.enriched_at) {
    const lastCheck = Date.parse(existing.enriched_at);
    const elapsed = Date.now() - lastCheck;
    if (Number.isFinite(lastCheck) && elapsed < options.cooldownMs) {
      return {
        company: existing,
        checkedLive: false,
        skipped: true,
      };
    }
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

  const nextHiringPageUrl = outcome.hiring_page_url ?? existing.hiring_page_url;
  const nextHiringProvider = outcome.hiring_provider ?? existing.hiring_provider;
  const nextStackJson = JSON.stringify(mergedStack);
  const hasCompanyDataChanged =
    nextHiringPageUrl !== existing.hiring_page_url ||
    nextHiringProvider !== existing.hiring_provider ||
    outcome.open_roles_count !== existing.open_roles_count ||
    nextStackJson !== JSON.stringify(existing.tech_stack || []) ||
    score !== existing.sniper_score;
  const lastEnrichedAt = existing.enriched_at
    ? Date.parse(existing.enriched_at)
    : Number.NaN;
  const refreshCheckpointDue =
    !Number.isFinite(lastEnrichedAt) || Date.now() - lastEnrichedAt >= 24 * 60 * 60 * 1000;

  // Avoid writing an unchanged company row on every manual check. The timestamp
  // checkpoint only needs refreshing daily; substantive changes refresh it now.
  if (hasCompanyDataChanged || refreshCheckpointDue) {
    if (hasCompanyDataChanged) {
      await env.DB.prepare(
        `UPDATE companies
         SET hiring_page_url = ?, hiring_provider = ?, open_roles_count = ?,
             tech_stack_json = ?, founder_twitter = ?, founder_linkedin = ?,
             founder_email = ?, sniper_score = ?, enriched_at = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          nextHiringPageUrl,
          nextHiringProvider,
          outcome.open_roles_count,
          nextStackJson,
          nextTwitter,
          nextLinkedin,
          nextEmail,
          score,
          nowIso,
          nowIso,
          companyId
        )
        .run();
    } else {
      await env.DB.prepare("UPDATE companies SET enriched_at = ? WHERE id = ?")
        .bind(nowIso, companyId)
        .run();
    }
  }

  // A successful ATS response is authoritative. Upsert only changed postings,
  // then remove stale IDs; never delete/reinsert an identical board on refresh.
  if (outcome.jobsVerified) {
    const currentJobs = new Map((existing.jobs || []).map((job) => [job.id, job]));
    const changedJobs = outcome.jobs.filter((job) => {
      const current = currentJobs.get(job.id);
      return !current ||
        current.title !== job.title ||
        current.url !== job.url ||
        (current.location ?? null) !== (job.location ?? null) ||
        Boolean(current.remote) !== Boolean(job.remote) ||
        (current.department ?? null) !== (job.department ?? null) ||
        (current.description ?? null) !== (job.description ?? null) ||
        (current.posted_at ?? null) !== (job.posted_at ?? null);
    });
    const desiredIds = outcome.jobs.map((job) => job.id);
    const desiredIdSet = new Set(desiredIds);
    const hasStaleJobs = (existing.jobs || []).some((job) => !desiredIdSet.has(job.id));
    const jobStmts = changedJobs.map((job) =>
      env.DB.prepare(
        `INSERT INTO jobs (id, company_id, title, url, location, remote, department, description, posted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           url = excluded.url,
           location = excluded.location,
           remote = excluded.remote,
           department = excluded.department,
           description = excluded.description,
           posted_at = excluded.posted_at`
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
    if (hasStaleJobs) {
      if (desiredIds.length > 0) {
        const placeholders = desiredIds.map(() => "?").join(", ");
        jobStmts.push(
          env.DB.prepare(
            `DELETE FROM jobs WHERE company_id = ? AND id NOT IN (${placeholders})`
          ).bind(companyId, ...desiredIds)
        );
      } else {
        jobStmts.push(
          env.DB.prepare("DELETE FROM jobs WHERE company_id = ?").bind(companyId)
        );
      }
    }
    if (jobStmts.length > 0) await env.DB.batch(jobStmts);
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
  const syncResult = await syncAllSources(env, { forceLive: true });
  if (!syncResult.skipped) await enrichCompanyBatch(env, 12);
}
