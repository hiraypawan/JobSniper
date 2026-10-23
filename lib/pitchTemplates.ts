import { Company, PitchSettings } from "./types";

export interface PitchBundle {
  classicSpecDm: string;
  roleHookDm: string;
  linkedinNote: string;
  emailSubject: string;
  emailBody: string;
  proposedBuildIdea: string;
  angleRationale: string;
}

export function buildOutreachPitches(
  company: Company,
  settings: PitchSettings
): PitchBundle {
  const name = company.name || "this startup";
  const offer = settings.customToolIdea || "a focused build";
  const proof = settings.similarCompanyProof || "relevant past work";
  const days = settings.deliveryDays || 5;
  const sender = settings.senderName || "A builder";
  const classic = `Hey ${company.founder_name ? company.founder_name.split(" ")[0] : "team"} — ${sender} here. I noticed ${name} (${company.batch ? `YC ${company.batch}` : "recent funding"}) is building in ${company.tags?.join(", ") || "this space"}. I can deliver ${offer} within ${days} days. Worth a quick reply?`;
  return {
    classicSpecDm: classic,
    roleHookDm: `Hi ${company.founder_name ? company.founder_name.split(" ")[0] : "team"} — saw ${name} is hiring. I can help deliver ${offer} in ${days} days. Open to a brief chat?`,
    linkedinNote: `Quick note on ${name}: I build ${offer} for funded startups (${days}d delivery). Would a quick conversation be useful?`,
    emailSubject: `${name}: ${offer} in ${days} days`,
    emailBody: `Hi${company.founder_name ? ` ${company.founder_name.split(" ")[0]}` : ""},\n\nI'm ${sender}. I work on ${offer} for early-stage companies like ${name}. Based on your listing (${proof ? `similar to ${proof}` : "relevant experience"}), I could deliver this within ${days} days.\n\nWorth a brief reply?`,
    proposedBuildIdea: offer,
    angleRationale: `Evidence: ${company.one_liner || company.description || "Listed startup data"}`,
  };
}
