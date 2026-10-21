import fs from "node:fs";
import path from "node:path";
import {
  D1Database,
  D1PreparedStatement,
  D1Result,
  WorkerEnv,
} from "@/lib/cf-types";

interface SqliteStatementLike {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
}

interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatementLike;
}

declare global {
  // eslint-disable-next-line no-var
  var __jobSniperSqliteInstance: D1Database | undefined;
}

function sanitizeParam(val: unknown): unknown {
  if (val === undefined) return null;
  if (typeof val === "boolean") return val ? 1 : 0;
  return val;
}

class LocalD1Statement implements D1PreparedStatement {
  private boundValues: unknown[] = [];

  constructor(
    private db: SqliteDatabaseLike,
    private sql: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const next = new LocalD1Statement(this.db, this.sql);
    next.boundValues = values.map(sanitizeParam);
    return next;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.boundValues);
    if (!row) return null;
    const plain = { ...row };
    if (colName) {
      return ((plain as Record<string, unknown>)[colName] as T) ?? null;
    }
    return plain as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.boundValues).map((r) => ({ ...r }) as T);
    return {
      results: rows,
      success: true,
    };
  }

  async run(): Promise<D1Result> {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.boundValues);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

export function getLocalD1Database(): D1Database {
  if (globalThis.__jobSniperSqliteInstance) {
    return globalThis.__jobSniperSqliteInstance;
  }

  const dataDir = path.join(process.cwd(), ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "startupsniper.sqlite");

  // Dynamic require keeps bundlers clean while using Node 22 built-in SQLite engine
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeSqlite = eval("require")("node:sqlite") as {
    DatabaseSync: new (filePath: string) => SqliteDatabaseLike;
  };
  const rawDb = new nodeSqlite.DatabaseSync(dbPath);
  rawDb.exec("PRAGMA journal_mode = WAL;");
  rawDb.exec("PRAGMA synchronous = NORMAL;");
  rawDb.exec("PRAGMA foreign_keys = ON;");

  const migrationPath = path.join(
    process.cwd(),
    "migrations",
    "0001_init.sql"
  );
  if (fs.existsSync(migrationPath)) {
    rawDb.exec(fs.readFileSync(migrationPath, "utf-8"));
  }

  const wrapper: D1Database = {
    prepare(query: string) {
      return new LocalD1Statement(rawDb, query);
    },
    async batch<T = Record<string, unknown>>(
      statements: D1PreparedStatement[]
    ): Promise<D1Result<T>[]> {
      rawDb.exec("BEGIN TRANSACTION;");
      try {
        const out: D1Result<T>[] = [];
        for (const s of statements) {
          out.push((await s.run()) as D1Result<T>);
        }
        rawDb.exec("COMMIT;");
        return out;
      } catch (err) {
        rawDb.exec("ROLLBACK;");
        throw err;
      }
    },
    async exec(query: string) {
      const t0 = Date.now();
      rawDb.exec(query);
      return { count: 1, duration: Date.now() - t0 };
    },
  };

  globalThis.__jobSniperSqliteInstance = wrapper;
  return wrapper;
}

export function getLocalWorkerEnv(): WorkerEnv {
  return {
    DB: getLocalD1Database(),
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
  };
}
