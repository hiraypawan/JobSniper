import assert from "node:assert/strict";
import { queryCompanies } from "@/workers/db";
import type { WorkerEnv } from "@/lib/cf-types";

class MockStatement {
  constructor(
    private readonly db: MockDatabase,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]) {
    this.db.calls.push({ sql: this.sql, params });
    return this;
  }

  async run() {
    return { meta: { changes: 0 } };
  }

  async first<T>() {
    return { cnt: 0 } as T;
  }

  async all<T>() {
    return { results: [] as T[] };
  }
}

class MockDatabase {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  prepare(sql: string) {
    return new MockStatement(this, sql);
  }
}

async function main() {
  const db = new MockDatabase();
  const result = await queryCompanies(
    { DB: db } as unknown as WorkerEnv,
    {
      fresh14d: true,
      indiaOnly: true,
      fresherOnly: true,
      hiring: true,
      sort: "newest",
    },
  );

  assert.equal(result.total, 0);
  const countQuery = db.calls.find((call) => call.sql.includes("SELECT COUNT(*) AS cnt"));
  const listQuery = db.calls.find((call) => call.sql.includes("SELECT * FROM companies"));
  assert(countQuery, "count query was generated");
  assert(listQuery, "company query was generated");
  assert.match(countQuery.sql, /recent_job\.posted_at >= \?/);
  assert.match(countQuery.sql, /last_funding_date IS NOT NULL/);
  assert.match(countQuery.sql, /india_job\.location/);
  assert.match(countQuery.sql, /early_job\.description/);
  assert.match(countQuery.sql, /not open to fresher/);
  assert.match(countQuery.sql, /open_roles_count > 0 OR hiring_page_url IS NOT NULL/);
  assert.match(listQuery.sql, /SELECT MAX\(recent_job\.posted_at\)/);
  assert(countQuery.params.includes("%india%"));
  assert(countQuery.params.includes("%freshers%"));
  assert(countQuery.params.includes("%junior%"));

  console.log("Recent, India-eligible, hiring, and fresher-role filter SQL checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
