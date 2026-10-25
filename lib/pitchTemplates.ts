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

function cleanEvidence(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function buildOutreachPitches(
  company: Company,
  settings: PitchSettings
): PitchBundle {
  const offer = settings.customToolIdea?.trim() || "";
  const role = company.jobs?.[0];
  const roleTitle = cleanEvidence(role?.title);
  const roleLocation = cleanEvidence(role?.location);
  const evidence = roleTitle
    ? `the ${roleTitle} opening${roleLocation ? ` listed for ${roleLocation}` : ""}`
    : cleanEvidence(company.one_liner || company.description);
  const sender = settings.senderName?.trim() || "";
  const days = settings.deliveryDays || 5;
  const proof = settings.similarCompanyProof?.trim() || "";
  const empty: PitchBundle = {
    classicSpecDm: "",
    roleHookDm: "",
    linkedinNote: "",
    emailSubject: "",
    emailBody: "",
    proposedBuildIdea: "",
    angleRationale: "",
  };

  // Do not generate a canned or ungrounded pitch when the sender has not
  // supplied an offer, or when the source record has no company/role evidence.
  if (!offer || !evidence) return empty;

  const greeting = company.founder_name?.trim().split(/\s+/)[0] || "team";
  const senderIntro = sender ? `${sender} here. ` : "";
  const proofLine = proof ? ` Relevant work: ${proof}.` : "";
  const evidenceSentence = roleTitle
    ? `I saw ${evidence} at ${company.name}.`
    : `I saw your source-listed update: “${evidence}”.`;
  const offerSentence = `I can build ${offer} and deliver it in ${days} days.`;

  return {
    classicSpecDm: `Hi ${greeting} - ${senderIntro}${evidenceSentence} ${offerSentence}${proofLine} Open to a short conversation?`,
    roleHookDm: `Hi ${greeting} - I saw ${evidence} at ${company.name}. I can build ${offer} in ${days} days to support that work.${proofLine} Would a brief chat help?`,
    linkedinNote: `${company.name}: I saw ${roleTitle ? `${roleTitle} role` : evidence}. I can build ${offer} in ${days} days.${proofLine ? ` ${proofLine.trim()}` : ""}`.slice(0, 300),
    emailSubject: `${company.name}: ${offer}`,
    emailBody: `Hi ${company.founder_name?.trim() || "team"},\n\n${senderIntro}${evidenceSentence}\n\n${offerSentence}${proofLine}\n\nWould a brief conversation be useful?`,
    proposedBuildIdea: offer,
    angleRationale: `Grounded in source-listed details: ${evidence}`,
  };
}
