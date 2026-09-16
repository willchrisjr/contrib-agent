---
cron: "0 14 * * *"
---

Run one contrib-agent cycle.

1. Call search_issues with dryRun matching the profile (default true).
2. Rank and pick the top eligible issue. If none, finish without sending a PR.
3. If the profile is dryRun, report the ranked list and stop.
4. If live, implement only a small, specific change, run_checks, then open_draft_pr as a draft with Fixes #N.
5. Never exceed caps. Never edit workflows on a discovered repo. Never push to the origin default branch.
