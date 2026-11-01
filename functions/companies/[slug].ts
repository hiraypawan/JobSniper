import type { WorkerEnv } from "@/lib/cf-types";

type PublicCompany = { id: string; name: string; one_liner: string | null; description: string | null; location: string | null };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const onRequest = async (context: {
  request: Request;
  env: WorkerEnv;
  params: { slug?: string | string[] };
}): Promise<Response> => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const slug = context.params.slug;
  if (typeof slug !== "string" || !slug || slug.length > 255) return new Response("Not found", { status: 404 });
  try {
    const company = await context.env.DB.prepare(
      "SELECT id, name, one_liner, description, location FROM companies WHERE id = ? AND outreach_status != 'archived'"
    ).bind(slug).first<PublicCompany>();
    if (!company) return new Response("Company not found", { status: 404 });
    const name = company.name || "Company";
    const summary = (company.one_liner || company.description || "Explore company information and job leads on JobSniper.").replace(/\s+/g, " ").trim();
    const description = summary.slice(0, 155);
    const title = name + " company profile | JobSniper";
    const canonical = "https://jobsniper.pages.dev/companies/" + encodeURIComponent(company.id);
    const location = company.location ? "<p><strong>Location:</strong> " + escapeHtml(company.location) + "</p>" : "";
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + escapeHtml(title) + '</title><meta name="description" content="' + escapeHtml(description) + '">' +
      '<link rel="canonical" href="' + escapeHtml(canonical) + '">' +
      '<style>body{margin:0;background:#fff8f1;color:#172e2a;font:16px/1.6 system-ui,sans-serif}main{max-width:48rem;margin:3rem auto;padding:0 1.25rem}article{background:#fff;border:1px solid #e7d9d1;border-radius:1.25rem;padding:1.5rem;box-shadow:0 8px 24px #4731360f}a{color:#146b60}h1{line-height:1.2}small{color:#536b65}</style></head><body>' +
      '<main><nav aria-label="Breadcrumb"><a href="/">JobSniper home</a></nav><article><h1>' + escapeHtml(name) + '</h1>' +
      '<p>' + escapeHtml(summary) + '</p>' + location +
      '<section><h2>Hiring information</h2><p>Hiring status is not independently verified. Check the original source before applying.</p>' +
      '<p><a href="/">Find job leads on JobSniper</a></p></section></article><small>Information may change over time.</small></main></body></html>';
    return new Response(context.request.method === "HEAD" ? null : html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Company information temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
