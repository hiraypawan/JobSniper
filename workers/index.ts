import {
  ScheduledController,
  WorkerEnv,
  WorkerExecutionContext,
} from "@/lib/cf-types";
import { handleApiRequest } from "@/workers/api";
import { runScheduledCron } from "@/workers/scheduled";

const workerHandler = {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("StartupSniper Worker Active. Call /api/companies.", {
      status: 200,
    });
  },

  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: WorkerExecutionContext
  ): Promise<void> {
    await runScheduledCron(controller, env, ctx);
  },
};

export default workerHandler;
