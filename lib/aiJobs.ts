import { Company } from "./types";
import { ContactInfo } from "./outreach";
import { HUMAN_VOICE_RULES, humanizeDeep } from "./humanize";
import {
  AIError,
  AIProvider,
  fetchAIText,
  extractJson,
  recordAIGeneration,
} from "./aiPitches";

export interface AIContactResult {
  contacts: ContactInfo[];
  reasoning: string;
}

export interface AITailoredResume {
  summary: string;
  skills: string[];
  experience_bullets: string[];
  cover_letter: string;
  subject_line: string;
}

export interface AIInterviewPrep {
  company_questions: string[];
  role_questions: string[];
  behavioral_questions: string[];
  questions_to_ask: string[];
  key_talking_points: string[];
}

export interface AISalaryNegotiation {
  target_range: string;
  justification: string[];
  opener_script: string;
  response_to_low_offer: string;
  benefits_to_ask: string[];
  walk_away_number: string;
}

/**
 * Return only contacts explicitly stored on the source record. AI cannot verify
 * identity or live email/profile details from a company domain, so never guess.
 */
export async function findAIContacts(
  company: Company,
  _provider: AIProvider,
  _apiKey: string
): Promise<AIContactResult> {
  // A language model cannot verify identities or discover live contact details
  // from a domain. Return only person fields already supplied by a source.
  const hasSourceListedContact = Boolean(
    company.founder_name ||
      company.founder_email ||
      company.founder_linkedin ||
      company.founder_twitter
  );
  const contacts: ContactInfo[] = hasSourceListedContact
    ? [{
        name: company.founder_name || "Founder contact (name not listed)",
        role: "founder",
        ...(company.founder_email ? { email: company.founder_email } : {}),
        ...(company.founder_linkedin ? { linkedin: company.founder_linkedin } : {}),
        ...(company.founder_twitter ? { twitter: company.founder_twitter } : {}),
        source: "Contact fields present in the company record; verify before contacting.",
      }]
    : [];

  return {
    contacts,
    reasoning: contacts.length
      ? "These details were already present in the company record. No email pattern or social profile was guessed. Verify the details on the linked source before reaching out."
      : "No named person with source-listed contact details is available. No email address or social profile was generated.",
  };
}

/**
 * Rewrite a resume summary and a cover letter for one company.
 * The user's resume text is passed through untouched apart from what the
 * model returns, so keep the prompt strict about inventing experience.
 */
export async function tailorResumeAndCoverLetter(
  company: Company,
  userResume: string,
  provider: AIProvider,
  apiKey: string
): Promise<AITailoredResume> {
  const prompt = `You are rewriting one person's resume for one startup. Do not invent jobs, employers or numbers that are not in the text below. Keep their facts, change the framing.

${HUMAN_VOICE_RULES}

USER RESUME:
${userResume}

TARGET COMPANY:
${company.name}
${company.domain}
${company.description}
Open Roles: ${company.open_roles_count || 0}
Team Size: ${company.team_size || "Unknown"}
${company.founder_name ? `Founder: ${company.founder_name}` : ""}

Return ONLY raw JSON (no markdown) with:
- "summary": 2-3 sentence tailored professional summary
- "skills": array of 6-8 most relevant skills for this company
- "experience_bullets": array of 4-6 rewritten experience bullets emphasizing what this startup cares about
- "cover_letter": short cover letter (under 200 words) that reads like a person wrote it
- "subject_line": application subject line (under 60 chars)

Use the company's own words from the description where it helps.`;

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AITailoredResume;
    recordAIGeneration(provider, true);
    return humanizeDeep<AITailoredResume>(parsed);
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(
      `Could not build the resume: ${err instanceof Error ? err.message : String(err)}`,
      { provider }
    );
  }
}

/**
 * Interview questions for one company and one role title.
 */
export async function generateInterviewPrep(
  company: Company,
  roleTitle: string,
  provider: AIProvider,
  apiKey: string
): Promise<AIInterviewPrep> {
  const prompt = `You are helping a candidate prepare for one interview at one startup. Base the questions on the company description, the stage and the stack below. Skip generic advice.

${HUMAN_VOICE_RULES}

COMPANY: ${company.name}
${company.description}
Open Role: ${roleTitle}
Team Size: ${company.team_size || "Unknown"}
Tech Stack: ${(company.tech_stack || []).join(", ")}
Industry: ${(company.tags || []).join(", ")}

Return ONLY raw JSON (no markdown) with:
- "company_questions": 5 questions likely to be asked about this specific company
- "role_questions": 5 technical/role-specific questions
- "behavioral_questions": 4 behavioral questions
- "questions_to_ask": 5 smart questions the candidate should ask the founder/team
- "key_talking_points": 5 points worth raising about this company's stage and stack`;

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AIInterviewPrep;
    recordAIGeneration(provider, true);
    return humanizeDeep<AIInterviewPrep>(parsed);
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(
      `Could not build interview prep: ${err instanceof Error ? err.message : String(err)}`,
      { provider }
    );
  }
}

/**
 * AI salary negotiation prep for one startup offer.
 */
export async function generateSalaryNegotiation(
  company: Company,
  roleTitle: string,
  currentOffer: string,
  provider: AIProvider,
  apiKey: string
): Promise<AISalaryNegotiation> {
  const prompt = `You are helping a candidate negotiate salary with one startup. Be direct, specific, and practical. No corporate speak.

${HUMAN_VOICE_RULES}

COMPANY: ${company.name}
${company.description}
Role: ${roleTitle}
Team Size: ${company.team_size || "Unknown"}
Funding Stage: ${company.batch || company.funding_amount || "Unknown"}
Current Offer: ${currentOffer || "Not stated yet"}

Return ONLY raw JSON (no markdown) with:
- "target_range": realistic salary range for this role at this stage (e.g. "95k-125k")
- "justification": 3-4 specific reasons why this range fits this company's stage and the role
- "opener_script": exact words to say when opening the salary conversation (under 100 words)
- "response_to_low_offer": exact words to respond if they offer below range (under 100 words)
- "benefits_to_ask": 4 non-salary benefits worth negotiating (equity, remote budget, etc.)
- "walk_away_number": the absolute minimum number to accept, with reasoning

Base ranges on the company's actual stage and funding, not generic market rates.`; 

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AISalaryNegotiation;
    recordAIGeneration(provider, true);
    return humanizeDeep<AISalaryNegotiation>(parsed);
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(
      `Could not build salary negotiation prep: ${err instanceof Error ? err.message : String(err)}`,
      { provider }
    );
  }
}
