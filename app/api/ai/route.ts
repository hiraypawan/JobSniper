import { handleAiRequest } from "@/app/api/ai/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const env: { GEMINI_API_KEY?: string; OPENROUTER_API_KEY?: string } = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  };
  return handleAiRequest(request, env);
}
