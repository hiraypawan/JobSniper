import { Company, PitchSettings } from "./types";

export type AIProvider = "gemini" | "openrouter";

export interface AIPitchResult {
  classicSpecDm: string;
  roleHookDm: string;
  linkedinNote: string;
  emailSubject: string;
  emailBody: string;
}

const GEMINI_KEY_STORAGE = "startupsniper_gemini_api_key";
const OPENROUTER_KEY_STORAGE = "startupsniper_openrouter_api_key";

export function getApiKey(provider: AIProvider): string | null {
  if (typeof window === "undefined") return null;
  try {
    return provider === "gemini"
      ? localStorage.getItem(GEMINI_KEY_STORAGE)
      : localStorage.getItem(OPENROUTER_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(provider: AIProvider, key: string): void {
  if (typeof window === "undefined") return;
  try {
    if (provider === "gemini") {
      localStorage.setItem(GEMINI_KEY_STORAGE, key);
    } else {
      localStorage.setItem(OPENROUTER_KEY_STORAGE, key);
    }
  } catch {
    // ignore quota errors
  }
}

export function clearApiKey(provider: AIProvider): void {
  if (typeof window === "undefined") return;
  try {
    if (provider === "gemini") {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    } else {
      localStorage.removeItem(OPENROUTER_KEY_STORAGE);
    }
  } catch {
    // ignore
  }
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenRouter(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://jobsniper.pages.dev",
      "X-Title": "StartupSniper",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateAIPitches(
  company: Company,
  settings: PitchSettings,
  provider: AIProvider
): Promise<AIPitchResult | null> {
  try {
    const apiKey = getApiKey(provider);
    if (!apiKey) throw new Error(`No ${provider} API key saved`);

    const founderFirst = company.founder_name
      ? company.founder_name.split(/[\s,(&/]+/)[0].trim()
      : "Founder";

    const cohortPhrase = company.batch
      ? `YC ${company.batch}`
      : company.funding_amount
        ? `just raised ${company.funding_amount}`
        : company.source === "producthunt"
          ? "launching on Product Hunt"
          : company.source === "indie"
            ? "on Hacker News"
            : "scaling fast";

    const topRole = company.jobs?.[0]?.title || null;

    const prompt = `You are an expert B2B outbound copywriter. Write 4 cold outreach formats for this startup. Sound like a real founder writing to another founder — natural, human, helpful, no hype, no buzzwords, no overly salesy language. Be specific and concise.

Company: ${company.name}
Domain: ${company.domain}
Batch/Cohort: ${cohortPhrase}
One-liner: ${company.one_liner}
Description: ${company.description}
Open Roles: ${company.open_roles_count || 0}
Top Role: ${topRole || "N/A"}
Hiring Provider: ${company.hiring_provider || "N/A"}
Founder Name: ${company.founder_name || "N/A"}
Founder Twitter: ${company.founder_twitter || "N/A"}
Founder LinkedIn: ${company.founder_linkedin || "N/A"}
Founder Email: ${company.founder_email || "N/A"}
Remote: ${company.is_remote ? "Yes" : "No"}
Team Size: ${company.team_size || "N/A"}
Tags: ${(company.tags || []).join(", ")}

User preferences:
- Sender name: ${settings.senderName || "not set"}
- Custom tool idea: ${settings.customToolIdea || "auto-detect based on their industry"}
- Similar company proof: ${settings.similarCompanyProof || "auto-detect"}
- Delivery turnaround: ${settings.deliveryDays || 5} days
- Demo offer: ${settings.demoOffer || "45 sec Loom demo"}

Return ONLY a raw JSON object (no markdown code blocks) with these exact keys:
- "classicSpecDm": A concise DM pitch (under 200 chars)
- "roleHookDm": A role-based hook DM referencing an open role (under 200 chars)
- "linkedinNote": A LinkedIn connection note (under 300 chars)
- "emailSubject": A cold email subject line (under 60 chars)
- "emailBody": A cold email body (short, human, under 200 words)

Personalize each format specifically to this company. Do not wrap in markdown.`;

    const response =
      provider === "gemini"
        ? await callGemini(apiKey, prompt)
        : await callOpenRouter(apiKey, prompt);

    const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as AIPitchResult;

    return {
      classicSpecDm: parsed.classicSpecDm || "",
      roleHookDm: parsed.roleHookDm || "",
      linkedinNote: parsed.linkedinNote || "",
      emailSubject: parsed.emailSubject || "",
      emailBody: parsed.emailBody || "",
    };
  } catch (err) {
    console.error("AI pitch generation failed:", err);
    return null;
  }
}
