import { WorkerEnv, WorkerExecutionContext } from "@/lib/cf-types";
import { handleApiRequest } from "@/workers/api";

// Cloudflare Pages Functions catch-all route (`/functions/api/[[route]].ts`)
// Lets Pages serve /api/* with the D1 `DB` binding. Nothing runs on a schedule.
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
