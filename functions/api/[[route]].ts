import { WorkerEnv, WorkerExecutionContext } from "@/lib/cf-types";
import { handleApiRequest } from "@/workers/api";

// Cloudflare Pages Functions catch-all route (`/functions/api/[[route]].ts`)
// Enables 100% serverless Pages deployment with D1 `DB` binding and ZERO Cron configuration required.
export const onRequest = async (context: {
  request: Request;
  env: WorkerEnv;
  waitUntil: (promise: Promise<unknown>) => void;
}): Promise<Response> => {
  const execCtx: WorkerExecutionContext = {
    waitUntil: (p) => context.waitUntil(p),
  };
  return handleApiRequest(context.request, context.env, execCtx);
};
