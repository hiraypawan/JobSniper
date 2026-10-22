import { CompanySource, HiringProvider } from "./types";
import { isDateWithinDays } from "./domain";

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  positive: boolean;
}

export interface ScoreComputation {
  score: number;
  breakdown: ScoreBreakdownItem[];
}

export function computeSniperScore(input: {
  batch?: string | null;
  last_funding_date?: string | null;
  funding_amount?: string | null;
  is_funded_last_12mo?: boolean;
  team_size?: number | null;
  open_roles_count?: number;
  hiring_provider?: HiringProvider;
  is_remote?: boolean;
  founder_name?: string | null;
  founder_twitter?: string | null;
  founder_linkedin?: string | null;
  founder_email?: string | null;
  sources?: CompanySource[];
}): ScoreComputation {
  let score = 0;
  const breakdown: ScoreBreakdownItem[] = [];

  // 1. Fresh capital / cohort momentum (max 32 pts)
  const freshBatches = new Set(["F26", "S26", "X26", "W26"]);
  const recentBatches = new Set(["F25", "S25", "X25", "W25"]);
  if (
    (input.batch && freshBatches.has(input.batch)) ||
    isDateWithinDays(input.last_funding_date, 180)
  ) {
    score += 32;
    breakdown.push({
      label: input.batch
        ? `Ultra-fresh ${input.batch} cohort capital`
        : "Funded within last 6 months",
      points: 32,
      positive: true,
    });
  } else if (
    (input.batch && recentBatches.has(input.batch)) ||
    input.is_funded_last_12mo
  ) {
    score += 24;
    breakdown.push({
      label: input.batch
        ? `Recent ${input.batch} funded startup`
        : "Funded in last 12 months",
      points: 24,
      positive: true,
    });
  }

  // 2. Founder-direct team size sweet spot for 5-day builds (max 25 pts)
  const size = input.team_size;
  if (typeof size === "number" && size >= 1 && size <= 10) {
    score += 25;
    breakdown.push({
      label: `Tiny team (${size}), founder reads DMs and needs things shipped`,
      points: 25,
      positive: true,
    });
  } else if (typeof size === "number" && size > 10 && size <= 25) {
    score += 18;
    breakdown.push({
      label: `Lean seed team (${size} people), decisions happen fast`,
      points: 18,
      positive: true,
    });
  } else if (typeof size === "number" && size > 25 && size <= 50) {
    score += 10;
    breakdown.push({
      label: `Growth stage under 50 (${size} people)`,
      points: 10,
      positive: true,
    });
  } else if (!size) {
    score += 12;
    breakdown.push({
      label: "Early-stage team profile",
      points: 12,
      positive: true,
    });
  }

  // 3. Active backlog pain via open roles & verified ATS (max 23 pts)
  const roles = input.open_roles_count || 0;
  if (roles >= 2) {
    score += 20;
    breakdown.push({
      label: `${roles} open roles, budget exists and the backlog is real`,
      points: 20,
      positive: true,
    });
  } else if (roles === 1) {
    score += 15;
    breakdown.push({
      label: "1 open role, hiring is the bottleneck right now",
      points: 15,
      positive: true,
    });
  }

  if (
    input.hiring_provider &&
    ["greenhouse", "lever", "ashby", "workable"].includes(input.hiring_provider)
  ) {
    score += 5;
    breakdown.push({
      label: `Verified ${input.hiring_provider.toUpperCase()} job board`,
      points: 5,
      positive: true,
    });
  }

  // 4. Remote openness + Founder reachability + Multi-source momentum (max 20 pts)
  if (input.is_remote) {
    score += 8;
    breakdown.push({
      label: "Remote-friendly async culture",
      points: 8,
      positive: true,
    });
  }

  if (
    input.founder_twitter ||
    input.founder_linkedin ||
    input.founder_email ||
    input.founder_name
  ) {
    score += 8;
    breakdown.push({
      label: "Direct founder / social contact identified",
      points: 8,
      positive: true,
    });
  }

  if ((input.sources?.length || 0) >= 2) {
    score += 6;
    breakdown.push({
      label: `Multi-channel momentum (${input.sources!.join(" + ")})`,
      points: 6,
      positive: true,
    });
  }

  return {
    score: Math.min(99, Math.max(15, score)),
    breakdown,
  };
}
