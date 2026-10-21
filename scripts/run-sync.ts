import { getDashboardStats } from "@/workers/db";
import { getLocalWorkerEnv } from "@/workers/localD1";
import { enrichCompanyBatch, syncAllSources } from "@/workers/scheduled";

async function main() {
  console.log("⚡ Running StartupSniper Live Worker Sync...");
  const env = getLocalWorkerEnv();
  const res = await syncAllSources(env, { forceLive: true });
  console.log(
    `✓ Sources synced in ${res.durationMs}ms -> ${res.upsertedCount} unique startups, ${res.jobsUpsertedCount} open role entries`
  );
  for (const s of res.sources) {
    console.log(
      `  • [${s.source.padEnd(15)}] ${String(s.count).padStart(4)} startups | ${String(
        s.jobsCount
      ).padStart(4)} roles | ${s.mode} (${s.durationMs}ms)`
    );
  }

  const enrich = await enrichCompanyBatch(env, 15);
  console.log(
    `✓ Live signal enrichment pass complete (${enrich.enriched} checked, ${enrich.remaining} queued for on-demand/lazy enrich)`
  );

  const stats = await getDashboardStats(env);
  console.log("✓ Database Summary:", {
    totalCompanies: stats.totalCompanies,
    fundedLast12Mo: stats.fundedLast12Mo,
    hiringNow: stats.hiringNow,
    remoteCompanies: stats.remoteCompanies,
    hotLeadsCount: stats.hotLeadsCount,
    totalOpenRoles: stats.totalOpenRoles,
    byProvider: stats.byProvider,
  });
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
