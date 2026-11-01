import assert from "node:assert/strict";
import { normalizeJobicyJobs, normalizeRemotiveJobs } from "@/workers/fetchers/openRemoteJobs";
import { buildOutreachPitches } from "@/lib/pitchTemplates";
import { DEFAULT_PITCH_SETTINGS } from "@/lib/pitchSettings";
import type { Company } from "@/lib/types";

const remotive = normalizeRemotiveJobs({
  jobs: [
    {
      id: 11,
      url: "https://remotive.com/remote-jobs/software-dev/india-engineer-11",
      title: "Senior Backend Engineer",
      company_name: "Verified India Co",
      publication_date: "2026-10-20T08:00:00Z",
      candidate_required_location: "India",
      category: "Software Development",
      description: "<p>Build APIs for a real product.</p>",
      company_logo: "https://cdn.example.com/logo.png",
    },
    {
      id: 12,
      url: "https://remotive.com/remote-jobs/software-dev/us-only-12",
      title: "US-only Engineer",
      company_name: "US-only Co",
      candidate_required_location: "United States",
    },
    {
      id: 13,
      url: "javascript:alert(1)",
      title: "Unsafe URL",
      company_name: "Unsafe Co",
      candidate_required_location: "Worldwide",
    },
  ],
});

assert.equal(remotive.length, 2, "safe India and US listings remain in the dataset"); assert.equal(remotive[1].name, "US-only Co"); assert.equal(remotive[1].jobs?.[0].location, "United States"); assert.equal(remotive[1].website, "");
assert.equal(remotive[0].name, "Verified India Co");
assert.equal(remotive[0].website, "", "missing employer websites must remain missing");
assert.match(remotive[0].id || "", /startup_local/, "internal key is visibly synthetic");
assert.equal(remotive[0].jobs?.[0].location, "India");
assert.equal(remotive[0].jobs?.[0].posted_at, "2026-10-20");
assert.equal(remotive[0].jobs?.[0].url, "https://remotive.com/remote-jobs/software-dev/india-engineer-11");
assert.match(remotive[0].description, /does not provide a verified company website/);

// Each newly imported Remotive job must link back to a Remotive listing.
const remotiveUrlCases: Array<[string, boolean]> = [
  ["https://remotive.com/remote-jobs/software-dev/engineer-11", true],
  ["https://www.remotive.com/remote-jobs/design/designer-12?ref=api", true],
  ["https://example.com/remote-jobs/software-dev/engineer-11", false],
  ["https://remotive.com.example.org/remote-jobs/software-dev/engineer-11", false],
  ["https://user:password@remotive.com/remote-jobs/software-dev/engineer-11", false],
  ["http://remotive.com/remote-jobs/software-dev/engineer-11", false],
  ["https://remotive.com/remote-jobs/software-dev", false],
  ["https://remotive.com/", false],
  ["javascript:alert(1)", false],
];
for (const [url, accepted] of remotiveUrlCases) {
  const result = normalizeRemotiveJobs({ jobs: [{
    url, title: "Engineer", company_name: "Example", candidate_required_location: "Worldwide",
  }] });
  assert.equal(result.length, accepted ? 1 : 0, `Remotive attribution URL: ${url}`);
  if (accepted) assert.equal(result[0].jobs?.[0].url, url);
}

const groundedPitch = buildOutreachPitches(
  { ...remotive[0], jobs: remotive[0].jobs as Company["jobs"] } as unknown as Company,
  { ...DEFAULT_PITCH_SETTINGS, customToolIdea: "a role-specific onboarding prototype" },
);
assert.match(groundedPitch.roleHookDm, /Senior Backend Engineer/);
assert.match(groundedPitch.roleHookDm, /India/);
assert.doesNotMatch(groundedPitch.classicSpecDm, /recent funding/);
assert.equal(buildOutreachPitches(
  { ...remotive[0], jobs: remotive[0].jobs as Company["jobs"] } as unknown as Company,
  DEFAULT_PITCH_SETTINGS,
).classicSpecDm, "", "no generic pitch is returned without a sender-supplied offer");

const jobicy = normalizeJobicyJobs({
  jobs: [
    {
      id: 1,
      url: "https://jobicy.com/jobs/role-1",
      jobTitle: "Product Designer",
      companyName: "APAC Product Co",
      jobGeo: "Asia-Pacific",
      pubDate: "2026-10-22T12:30:00Z",
      jobIndustry: ["Design"],
      jobLevel: "Entry level",
      jobDescription: "Design clear workflows.",
    },
    {
      id: 2,
      url: "https://jobicy.com/jobs/role-2",
      jobTitle: "Product Engineer",
      companyName: "APAC Product Co",
      jobGeo: "Anywhere",
      pubDate: "2026-10-23T12:30:00Z",
      jobIndustry: ["Engineering"],
    },
  ],
});

assert.equal(jobicy.length, 1, "roles from one employer are grouped");
assert.equal(jobicy[0].jobs?.length, 2);
assert.equal(jobicy[0].open_roles_count, 2);
assert.equal(jobicy[0].jobs?.[0].department, "Entry level");
assert.match(jobicy[0].jobs?.[0].description || "", /Source-listed level: Entry level/);
assert.equal(jobicy[0].is_remote, true);
assert(jobicy[0].jobs?.every((job) => job.remote && job.location));

console.log("Open remote job feed normalization tests passed.");
