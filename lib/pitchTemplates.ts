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

const ROLE_ANGLES: Array<{ pattern: RegExp; idea: string; reason: string }> = [
  {
    pattern: /recruit|talent acquisition|people ops|human resources|\bhr\b/i,
    idea: "a candidate intake and interview coordination workflow for the hiring team",
    reason: "the recruiting role suggests candidate coordination is becoming a real workload",
  },
  {
    pattern: /growth|gtm|sales|sdr|bdr|marketing|demand|revops|account executive/i,
    idea: "a product-specific lead qualification flow with a useful ROI demo",
    reason: "the open GTM role points to a need for more qualified conversations",
  },
  {
    pattern: /customer success|support|customer experience|implementation|onboarding/i,
    idea: "a guided onboarding flow that answers setup questions inside the product",
    reason: "the customer-facing role suggests onboarding and support work is growing",
  },
  {
    pattern: /product manager|product designer|ux|ui designer/i,
    idea: "a focused activation flow that helps new users reach the product's core value",
    reason: "the product hire suggests the team is investing in the user journey",
  },
  {
    pattern: /security|compliance|risk|trust/i,
    idea: "a self-serve security and compliance evidence workspace for buyer reviews",
    reason: "the security-focused hiring signal points to heavier customer review work",
  },
  {
    pattern: /data|analytics|machine learning|\bai\b|\bml\b|research/i,
    idea: "an interactive product sandbox with realistic data and a clear first-use path",
    reason: "the technical hiring signal suggests the product is adding capabilities users need to understand",
  },
  {
    pattern: /software engineer|frontend|full[- ]?stack|backend|platform|developer/i,
    idea: "a working integration sandbox that gets new users to a first successful result",
    reason: "the engineering hire signals active product work and a chance to shorten setup for users",
  },
  {
    pattern: /operations|finance|accounting|people|recruit/i,
    idea: "a small internal workflow tool that removes repetitive handoffs from the team's process",
    reason: "the operations hire suggests some recurring work is ready to be streamlined",
  },
];

const COMPANY_ANGLES: Array<{
  pattern: RegExp;
  idea: string;
  reason: string;
}> = [
  {
    pattern: /agent|llm|\bai\b|machine learning|copilot|rag|automation|voice/i,
    idea: "an interactive AI workflow sandbox with a guided first-use path",
    reason: "AI products often need a concrete way for prospects to try a real workflow",
  },
  {
    pattern: /fintech|payment|compliance|billing|bank|ledger|crypto|tax/i,
    idea: "a self-serve onboarding flow with a clear setup and compliance checklist",
    reason: "financial products often face setup and buyer-review friction",
  },
  {
    pattern: /health|bio|clinical|medical|care|patient/i,
    idea: "a secure intake and care-team workflow that cuts repetitive coordination",
    reason: "health teams often need to connect intake with day-to-day operations",
  },
  {
    pattern: /devtools|developer|api|sdk|infra|cloud|security|data platform/i,
    idea: "an interactive API playground with a working example for the first integration",
    reason: "developer products benefit when users can reach a first working request quickly",
  },
  {
    pattern: /marketplace|commerce|e-commerce|retail|consumer|shopping/i,
    idea: "a guided buyer journey that helps shoppers compare options and complete a purchase",
    reason: "commerce products depend on helping users move from discovery to a confident decision",
  },
];

function firstUsefulRole(company: Company): string | null {
  const roles = (company.jobs || []).map((job) => job.title).filter(Boolean);
  return (
    roles.find((title) => ROLE_ANGLES.some((angle) => angle.pattern.test(title))) ||
    roles[0] ||
    null
  );
}

export function inferBuildAngle(company: Company): InferredAngle {
  const haystack = [
    company.name,
    company.one_liner,
    company.description,
    ...(company.tags || []),
    ...(company.tech_stack || []),
  ]
    .filter(Boolean)
    .join(" ");
  const topRole = firstUsefulRole(company);
  const roleAngle = topRole
    ? ROLE_ANGLES.find((angle) => angle.pattern.test(topRole))
    : undefined;
  const companyAngle = COMPANY_ANGLES.find((angle) => angle.pattern.test(haystack));
  const chosen = roleAngle || companyAngle;

  if (chosen) {
    return {
      toolIdea: chosen.idea,
      similarCompany: "",
      bottleneckReason: chosen.reason,
      topRole,
    };
  }

  const roleCount = company.open_roles_count;
  return {
    toolIdea: "a small product workflow tailored to the way its customers use the product",
    similarCompany: "",
    bottleneckReason:
      roleCount > 0
        ? `the team has ${roleCount} open role${roleCount === 1 ? "" : "s"}, a signal that product work is expanding`
        : "a focused customer workflow could help the team turn its product into a clearer first-use experience",
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

function firstName(company: Company): string {
  if (!company.founder_name?.trim()) return "there";
  return company.founder_name.split(/[\s,(&/]+/)[0].trim() || "there";
}

function productContext(company: Company): string {
  const product = (company.one_liner || company.description || "").trim();
  if (!product) return `${company.name}'s product`;
  const sentence = product.split(/[.!?\n]/)[0].trim();
  return sentence.length > 115 ? `${sentence.slice(0, 112).trimEnd()}...` : sentence;
}

function shorten(input: string, max: number): string {
  if (input.length <= max) return input;
  const clipped = input.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || input.slice(0, max - 1).trim()}…`;
}

export function buildOutreachPitches(
  company: Company,
  settings: PitchSettings = DEFAULT_PITCH_SETTINGS
): GeneratedPitches {
  const inferred = inferBuildAngle(company);
  const greeting = firstName(company);
  const idea = settings.customToolIdea.trim() || inferred.toolIdea;
  const days = settings.deliveryDays || 5;
  const demo = settings.demoOffer.trim() || "45 sec Loom demo";
  const role = inferred.topRole;
  const product = productContext(company);
  const proof = settings.similarCompanyProof.trim();
  const proofLine = proof ? ` I have done similar work for ${proof}.` : "";
  const roleContext = role
    ? `I noticed the ${role} opening at ${company.name}. ${inferred.bottleneckReason}.`
    : `I came across ${company.name} and its work on ${product}.`;

  const classicSpecDm = `Hey ${greeting}, ${product} caught my eye. I have an idea for ${company.name}: ${idea}. I can build a first version in ${days} days. Want a ${demo}?`;
  const roleHookDm = role
    ? `Hey ${greeting}, ${roleContext} I could build ${idea} alongside that hiring push, in ${days} days. Want to see a ${demo}?`
    : `Hey ${greeting}, ${roleContext} I have a small build idea: ${idea}. I could make a first version in ${days} days. Worth a look?`;
  const linkedinNote = shorten(
    `Hi ${greeting}, ${product} caught my eye. I have a specific idea for ${company.name}: ${idea}. I build small product tools in ${days} days. Open to a short demo?`,
    300
  );
  const emailSubject = shorten(
    `${company.name}: ${role ? `an idea alongside your ${role} hire` : "a product workflow idea"}`,
    60
  );
  const emailBody = `Hi ${greeting},\n\nI came across ${company.name}. ${product} stood out. ${role ? `I also noticed the ${role} opening. ${inferred.bottleneckReason}.` : inferred.bottleneckReason.charAt(0).toUpperCase() + inferred.bottleneckReason.slice(1) + "."}\n\nOne idea: ${idea}. It could give users a clearer way to reach value without adding another large project to the team's plate.\n\nI can build a working first version in ${days} days and show you the idea in a ${demo}.${proofLine}\n\nWould that be useful to see?${settings.senderName.trim() ? `\n\n${settings.senderName.trim()}` : ""}`;

  return {
    inferred,
    classicSpecDm,
    roleHookDm,
    linkedinNote,
    emailSubject,
    emailBody,
  };
}
