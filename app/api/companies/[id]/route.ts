import { handleApiRequest } from "@/workers/api";
import { getLocalWorkerEnv } from "@/workers/localD1";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request, getLocalWorkerEnv());
}

export async function PATCH(request: Request): Promise<Response> {
  return handleApiRequest(request, getLocalWorkerEnv());
}
