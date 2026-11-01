# Job-source access audit

Observed 2026-11-01. This is a working checklist, not a legal opinion or a claim that missing permissions do not exist. Recheck terms, robots rules, and operational limits before enabling any source. Disabled sources are not fetched by this branch. Do not merge the source PR until the owner’s full source gate is satisfied.

| Source | Observations and current state |
| --- | --- |
| [RareRoles](https://www.rareroles.com/) | [OpenAPI](https://api.rareroles.com/openapi.json) and a jobs endpoint exist. [Terms](https://www.rareroles.com/terms) prohibit harvesting that overloads or harms the service. Permission for this integration remains unverified; the draft parser is not wired to sync. |
| [Himalayas](https://himalayas.app/api) | Public JSON API explicitly permits display on sites the operator owns. Its terms require an unchanged applicationLink, visible source link, and removal when jobs expire; onward distribution and JobPosting structured data are prohibited. India eligibility needs both the location restriction and the India UTC offset to allow it. Jobs can close before expiryDate. Disabled until attribution, lifecycle, restrictions and safe caching are implemented and tested. |
| [Career Hound](https://www.careerhound.io/) | [Terms](https://www.careerhound.io/terms-and-conditions) prohibit automated access without written permission. Disabled. |
| [SkipTheDrive](https://www.skipthedrive.com/) | Likely the requested “skip the drive”; naming is not certain. Its [robots.txt](https://www.skipthedrive.com/robots.txt) restricts job and search paths. A permitted feed has not been established. Disabled. |
| [Built In](https://builtin.com/) | [Terms](https://builtin.com/terms-use) and [robots.txt](https://builtin.com/robots.txt) reviewed; a permitted public jobs API or feed has not been established. Disabled. |
| [Underdog.io](https://underdog.io/) | A recruiting network. [Terms](https://underdog.io/terms) restrict scraping and downloading web-page data. No approved integration is configured. Disabled. |
| GitHub Jobs | GitHub [confirmed](https://github.blog/changelog/2021-04-19-deprecation-notice-github-jobs-site/) that jobs.github.com was sunset on March 21, 2024. Disabled. |
| [EuropeRemotely](https://europeremotely.com/) | The site returned unavailable content during the check. This does not prove the service is permanently closed. Disabled; a permitted feed has not been established. |
| [Jobspresso](https://jobspresso.co/) | Site active. [robots.txt](https://jobspresso.co/robots.txt) restricts query URLs and specifies a crawl delay. A permitted jobs feed has not been established. Disabled. |
| [Dynamite Jobs](https://dynamitejobs.com/) | Site active; [robots.txt](https://dynamitejobs.com/robots.txt) disallows /api/. Another permitted feed has not been established. Disabled. |
| Pangian | A [former job URL](https://pangian.com/remote/job/sales-manager-remote-2337) redirects to a domain-for-sale page. No claim is made about the entire company. Disabled. |
| Outsourcely | Website could not be reached during the check; closure is unverified. Disabled. |
| [Virtual Vocations](https://www.virtualvocations.com/) | Site active. [Terms](https://www.virtualvocations.com/disclaimer) prohibit automated access and scraping without written consent. No approved feed configured; disabled. |
| CloudPeeps | Website could not be reached during the check; closure is unverified. Disabled. |
| [Remotive](https://remotive.com/remote-jobs/api) | Existing integration. The public API requires attribution and links back to the job and prohibits submitting jobs to third-party sites. Its [API documentation](https://github.com/remotive-com/remote-jobs-api) recommends at most four requests per day. A six-hour cache was added, but cache failure and concurrent cold starts mean it is not a strict rate limiter. Review attribution, lifecycle, rate limiting and the existing India-only ingestion before claiming compliance. |

The existing `wellfound` source fetches funding RSS, not genuine Wellfound jobs. [Wellfound robots.txt](https://wellfound.com/robots.txt) restricts search and job paths; no permitted public job feed was established. FinSMEs and EU-Startups returned HTTP 403 during the live check; individual source status and last success still need verification after a fresh sync.

## Integration safeguards still needed

- Preserve per-role location and experience evidence, and verify employer sites rather than assigning aggregator domains.
- Use low-frequency requests, explicit identification and caching; do not rely on cache TTL alone as a strict global rate limit.
- Persist per-feed success time and counts, and distinguish unknown, disabled, blocked, cached and live states.
- For sources with expiration requirements, remove expired or earlier-closed listings from every public route, including company pages and sitemaps, and do not distribute prohibited structured data.
- Test parser fixtures and filtering with the hosted checks before enabling; a green build does not establish permission or production correctness.
