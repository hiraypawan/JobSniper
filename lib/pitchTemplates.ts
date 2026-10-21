import { Company, PitchSettings } from "./types";

export const DEFAULT_PITCH_SETTINGS: PitchSettings = {
  senderName: "",
  customToolIdea: "",
  similarCompanyProof: "",
  deliveryDays: 5,
  demoOffer: "45 sec Loom demo",
};

interface InferredAngle {
  toolIdea: string;
  similarCompany: string;
  bottleneckReason: string;
  topRole: string | null;
}

export function inferBuildAngle(company: Company): InferredAngle {
  const haystack = [
    company.name,
    company.one_liner,
    company.description,
    ...(company.tags || []),
    ...(company.jobs || []).map((j) => j.title),
  ]
    .join(" ")
    .toLowerCase();

  const topRole = company.jobs?.[0]?.title || null;

  if (
    /growth|gtm|sales|sdr|bdr|marketing|demand|revops/.test(haystack)
  ) {
    return {
      toolIdea: "outbound lead-enrichment + interactive ROI micro-tool",
      similarCompany: "a W26 B2B seed startup",
      bottleneckReason: "Hiring/scaling GTM & conversion velocity",
      topRole,
    };
  }

  if (/agent|llm|ai|ml|eval|voice|copilot|rag|automation/.test(haystack)) {
    return {
      toolIdea: "interactive AI workflow sandbox + customer onboarding copilot",
      similarCompany: "an early-stage YC AI infra team",
      bottleneckReason: "Turning AI capabilities into self-serve user activation",
      topRole,
    };
  }

  if (/fintech|payment|compliance|billing|bank|ledger|crypto|tax/.test(haystack)) {
    return {
      toolIdea: "self-serve onboarding & live compliance/ROI calculator flow",
      similarCompany: "a seed-stage fintech team",
      bottleneckReason: "Reducing enterprise onboarding friction",
      topRole,
    };
  }

  if (/health|bio|clinical|medical|care|patient/.test(haystack)) {
    return {
      toolIdea: "automated intake & clinic workflow portal",
      similarCompany: "a digital health seed team",
      bottleneckReason: "Eliminating manual ops bottlenecks",
      topRole,
    };
  }

  if (/devtools|developer|api|sdk|infra|cloud|security|data/.test(haystack)) {
    return {
      toolIdea: "interactive browser playground + 1-click starter integration",
      similarCompany: "a YC devtools team",
      bottleneckReason: "Cutting developer time-to-first-API-call under 2 minutes",
      topRole,
    };
  }

  return {
    toolIdea: "custom customer-facing micro-app & onboarding workflow",
    similarCompany: "a recent YC seed team",
    bottleneckReason:
      company.open_roles_count > 0
        ? `Backlog pressure across ${company.open_roles_count} open role${company.open_roles_count > 1 ? "s" : ""}`
        : "Post-funding product shipping sprint",
    topRole,
  };
}

export interface GeneratedPitches {
  inferred: InferredAngle;
  classicSpecDm: string;
  roleHookDm: string;
  linkedinNote: string;
  emailSubject: string;
  emailBody: string;
}

export function buildOutreachPitches(
  company: Company,
  settings: PitchSettings = DEFAULT_PITCH_SETTINGS
): GeneratedPitches {
  const inferred = inferBuildAngle(company);
  const founderFirst = company.founder_name
    ? company.founder_name.split(/[\s,(&/]+/)[0].trim()
    : `${company.name} team`;

  const cohortPhrase = company.batch
    ? `in YC ${company.batch}`
    : company.funding_amount
      ? `just raised (${company.funding_amount})`
      : company.source === "producthunt"
        ? "launching on Product Hunt"
        : company.source === "indie"
          ? "on Hacker News"
          : "scaling fast right now";

  const toolIdea = settings.customToolIdea.trim() || inferred.toolIdea;
  const similarCompany =
    settings.similarCompanyProof.trim() || inferred.similarCompany;
  const days = settings.deliveryDays || 5;
  const demo = settings.demoOffer.trim() || "45 sec demo";
  const signoff = settings.senderName.trim()
    ? `\n\n— ${settings.senderName.trim()}`
    : "";

  // 1. Exact spec pitch formula prefilled cleanly
  const classicSpecDm = `Hey ${founderFirst}, saw ${company.name} ${cohortPhrase}. I built a tiny ${toolIdea} for ${similarCompany}. Can ship a custom version for you in ${days} days. If you don't use it, pay nothing. Want a ${demo}?`;

  // 2. Open-role bottleneck hook DM
  const roleClause = inferred.topRole
    ? `noticed you're hiring a ${inferred.topRole} while scaling ${company.name}`
    : `saw ${company.name} ${cohortPhrase} and loved "${company.one_liner || company.name}"`;

  const roleHookDm = `Hey ${founderFirst} — ${roleClause}. While you fill headcount, I can take one self-contained ${toolIdea} off your roadmap and ship it production-ready in ${days} days (built one recently for ${similarCompany}). Zero risk: if your team doesn't ship it, you pay $0. Open to a quick ${demo}?`;

  // 3. Strict <300 char LinkedIn Connection Note
  let linkedinNote = `Hey ${founderFirst}, saw ${company.name} ${cohortPhrase}. Built a ${toolIdea} for ${similarCompany} — can ship a custom version for ${company.name} in ${days}d. If you don't use it, pay $0. Open to a ${demo}?`;
  if (linkedinNote.length > 295) {
    linkedinNote = `Hey ${founderFirst}, saw ${company.name} ${cohortPhrase}. I ship custom 5-day micro-tools for seed teams — pay $0 if you don't use it. Want a quick 45s demo built around ${company.name}?`.slice(
      0,
      295
    );
  }

  // 4. Cold Email Subject + Body
  const emailSubject = `${days}-day build idea for ${company.name}${company.batch ? ` (${company.batch})` : ""} — $0 if unused`;
  const emailBody = `Hey ${founderFirst},

Saw ${company.name} ${cohortPhrase}${inferred.topRole ? ` + your open ${inferred.topRole} role` : ""}.

I recently built a ${toolIdea} for ${similarCompany}, and put together a concrete idea tailored to ${company.name} (${company.domain}).

My offer is simple:
• I design, build, and hand over clean Next.js/TS code in ${days} days
• Zero meetings needed — async updates daily
• If your team doesn't actually use it in production, you pay $0

Want me to send over a ${demo} showing how it'd work on ${company.domain}?${signoff}`;

  return {
    inferred,
    classicSpecDm,
    roleHookDm,
    linkedinNote,
    emailSubject,
    emailBody,
  };
}
