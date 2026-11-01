import type { WorkerEnv } from "@/lib/cf-types";

export const onRequest = async (context: { request: Request; env: WorkerEnv }): Promise<Response> => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    const result = await context.env.DB.prepare(
      "SELECT id FROM companies WHERE outreach_status != 'archived' ORDER BY id LIMIT 50000"
    ).all<{ id: string }>();
    if (result.results.length >= 50000) {
      return new Response("Sitemap requires pagination", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const urls = [
      "https://jobsniper.pages.dev/",
      ...result.results.map((row) => "https://jobsniper.pages.dev/companies/" + encodeURIComponent(row.id)),
    ];
    const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + urls.map((url) => "<url><loc>" + escapeXml(url) + "</loc></url>").join("") + "</urlset>";
    return new Response(context.request.method === "HEAD" ? null : xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
