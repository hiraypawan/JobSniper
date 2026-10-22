// Minimal, zero-conflict Cloudflare Workers / Pages / D1 / KV runtime types
// Compatible simultaneously with Next.js 14 DOM types and Cloudflare Workers runtime.

export interface D1Meta {
  duration?: number;
  changes?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[]
  ): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface KVNamespace {
  get(key: string, type?: "text"): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AssetFetcher {
  fetch(request: Request | URL | string): Promise<Response>;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?: () => void;
}

export interface ScheduledController {
  scheduledTime: number;
  cron: string;
  noRetry?: () => void;
}

export interface WorkerEnv {
  DB: D1Database;
  CACHE?: KVNamespace;
  ASSETS?: AssetFetcher;
  GITHUB_TOKEN?: string;
  // Optional shared AI keys for the /api/ai proxy (AC7). Set via `wrangler secret put`
  // or Pages dashboard env vars so the app works without BYOK.
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
}
