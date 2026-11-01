import assert from "node:assert/strict";
import { queryCompanies } from "@/workers/db";
import type { WorkerEnv } from "@/lib/cf-types";

class MockStatement {
  constructor(private readonly db: MockDatabase, private readonly sql: string) {}
  bind(...params: unknown[]) { this.db.calls.push({ sql: this.sql, params }); return this; }
  async run() { return { meta: { changes: 0 } }; }
  async first<T>() { return { cnt: 0 } as T; }
  async all<T>() { return { results: [] as T[] }; }
}
class MockDatabase {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  prepare(sql: string) { return new MockStatement(this, sql); }
}

async function capture(filters: Parameters<typeof queryCompanies>[1]) {
  const db = new MockDatabase();
  await queryCompanies({ DB: db } as unknown as WorkerEnv, filters);
  const count = db.calls.find((call) => call.sql.includes("SELECT COUNT(*) AS cnt"));
  assert(count, "count query was generated");
  return count;
}

async function main() {
  const combined = await capture({ indiaOnly: true, fresherOnly: true });
  assert.match(combined.sql, /EXISTS \(SELECT 1 FROM jobs job WHERE job\.company_id = companies\.id/);
  assert.match(combined.sql, /job\.location/);
  assert.match(combined.sql, /job\.title/);
  assert.match(combined.sql, /NOT LIKE '% senior %'/);
  assert.match(combined.sql, /NOT LIKE '%closed now%'/);

  // Execute the generated SQL against isolated in-memory fixtures (Node 22+).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = eval("require")("node:sqlite") as {
    DatabaseSync: new (name: string) => {
      exec(sql: string): void;
      prepare(sql: string): { all(...params: unknown[]): Array<{ id: string }> };
      close(): void;
    };
  };
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, outreach_status TEXT, domain TEXT, one_liner TEXT, description TEXT);
    CREATE TABLE jobs (id TEXT, company_id TEXT, title TEXT, location TEXT, remote INTEGER, description TEXT);
    INSERT INTO companies (id, outreach_status) VALUES ('split','new'), ('india','new'), ('remote','new'), ('senior','new'), ('closed','new'), ('us','new'), ('indiana','new'), ('international','new'), ('excluded','new'), ('publisher','new'), ('closedcompany','new'), ('usonly','new'), ('experiencedjunior','new');
    UPDATE companies SET domain = 'news.ycombinator.com' WHERE id = 'publisher';
    UPDATE companies SET one_liner = 'CLOSED NOW' WHERE id = 'closedcompany';
    INSERT INTO jobs VALUES
      ('a','split','Senior Engineer','Bengaluru, India',0,''),
      ('b','split','Junior Engineer','New York, USA',0,''),
      ('c','india','Junior Engineer','Bengaluru, India',0,''),
      ('d','remote','Graduate Engineer','Remote worldwide',1,''),
      ('e','senior','Senior Engineer','Mumbai, India',0,'Mentors junior engineers'),
      ('f','closed','Junior Engineer','India',0,'CLOSED NOW'),
      ('g','us','Junior Engineer','New York, USA',0,''),
      ('h','indiana','Junior Engineer','Indiana, USA',0,''),
      ('i','international','International Engineer','India',0,''),
      ('j','excluded','Junior Engineer','Remote worldwide',1,'Not open to India'),
      ('k','publisher','Junior Engineer','India',0,''),
      ('l','closedcompany','Junior Engineer','India',0,''),
      ('m','usonly','Junior Engineer','Remote worldwide',1,'US only'),
      ('n','experiencedjunior','Junior Engineer','India',0,'Requires 5+ years of experience');
  `);
  const idsFor = (query: { sql: string; params: unknown[] }) =>
    sqlite.prepare(query.sql.replace("SELECT COUNT(*) AS cnt", "SELECT id")).all(...query.params).map((row) => row.id).sort();
  assert.deepEqual(idsFor(combined), ["india", "remote"]);
  assert(idsFor(await capture({})).includes("senior"), "unfiltered results retain senior roles");
  assert(!idsFor(await capture({ indiaOnly: true })).includes("us"), "US in-person role is not India eligible");
  assert(!idsFor(await capture({ fresherOnly: true })).includes("senior"), "senior title is not made junior by description");
  assert(!idsFor(await capture({ indiaOnly: true })).includes("indiana"), "Indiana is not India");
  assert(!idsFor(await capture({ fresherOnly: true })).includes("international"), "international is not intern");
  assert(!idsFor(combined).includes("excluded"), "explicit India exclusions are respected");
  assert(!idsFor(combined).includes("publisher"), "shared publisher records are excluded");
  assert(!idsFor(combined).includes("closedcompany"), "company excerpt marks the listing closed");
  assert(!idsFor(combined).includes("usonly"), "US-only remote is not India eligible");
  assert(!idsFor(combined).includes("experiencedjunior"), "junior title requiring five years is not fresher appropriate");
  assert(idsFor(await capture({})).includes("experiencedjunior"), "unfiltered results retain experienced roles");
  sqlite.close();

  const recent = await capture({ fresh14d: true, hiring: true, sort: "newest" });
  assert.match(recent.sql, /recent_job\.posted_at >= \?/);
  assert.match(recent.sql, /last_funding_date IS NOT NULL/);
  assert.match(recent.sql, /open_roles_count > 0 OR hiring_page_url IS NOT NULL/);
  console.log("Company filter SQL and fixture checks passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
