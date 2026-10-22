import { Company } from "./types";
import { ContactInfo } from "./outreach";
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

/**
 * AI Contact Finder - uses LLM to infer founder/HR emails and contacts
 * based on company data, domain, and public signals.
 */
export async function findAIContacts(
  company: Company,
  provider: AIProvider,
  apiKey: string
): Promise<AIContactResult> {
  const prompt = `You are an expert recruiter and sourcer. Given this startup, infer the most likely founder, CTO, and HR/recruiter contacts. Use the domain, founder name, and any social links provided to construct likely email patterns.

Company: ${company.name}
Domain: ${company.domain}
Website: ${company.website}
Founder Name: ${company.founder_name || "Unknown"}
Founder Twitter: ${company.founder_twitter || "None"}
Founder LinkedIn: ${company.founder_linkedin || "None"}
Team Size: ${company.team_size || "Unknown"}
Open Roles: ${company.open_roles_count || 0}
Description: ${company.description}

Return ONLY raw JSON (no markdown) with:
- "contacts": array of {name, role ("founder"|"hr"|"cto"|"recruiter"|"engineering_manager"), email (likely pattern like founder@domain.com or first.last@domain.com), linkedin, twitter, confidence (0-100), source}
- "reasoning": brief explanation of how you derived these

Focus on the founder first (highest response rate for early startups), then HR/recruiter, then CTO/Engineering Manager.`;

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AIContactResult;
    recordAIGeneration(provider, true);
    return parsed;
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(`Contact search failed: ${err instanceof Error ? err.message : String(err)}`, {
      provider,
    });
  }
}

/**
 * AI Resume & Cover Letter Tailor - customizes application per company
 */
export async function tailorResumeAndCoverLetter(
  company: Company,
  userResume: string,
  provider: AIProvider,
  apiKey: string
): Promise<AITailoredResume> {
  const prompt = `You are an expert resume writer and career coach. Tailor this user's resume and write a cover letter for this specific startup.

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
- "cover_letter": concise founder-to-founder cover letter (under 200 words), human tone, no hype
- "subject_line": email subject line for application (under 60 chars)

Sound like a real person, not corporate speak. Be specific to this company.`;

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AITailoredResume;
    recordAIGeneration(provider, true);
    return parsed;
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(`Resume generation failed: ${err instanceof Error ? err.message : String(err)}`, {
      provider,
    });
  }
}

/**
 * AI Interview Prep - company and role specific questions
 */
export async function generateInterviewPrep(
  company: Company,
  roleTitle: string,
  provider: AIProvider,
  apiKey: string
): Promise<AIInterviewPrep> {
  const prompt = `You are an expert interview coach. Generate interview preparation for this startup role.

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
- "key_talking_points": 5 key points to emphasize in the interview

Be specific to this company's stage, stack, and mission.`;

  try {
    const response = await fetchAIText(provider, prompt, apiKey);
    const parsed = extractJson(response) as AIInterviewPrep;
    recordAIGeneration(provider, true);
    return parsed;
  } catch (err) {
    recordAIGeneration(provider, false);
    if (err instanceof AIError) throw err;
    throw new AIError(`Interview prep failed: ${err instanceof Error ? err.message : String(err)}`, {
      provider,
    });
  }
}
