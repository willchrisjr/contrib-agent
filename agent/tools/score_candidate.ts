import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadProfile } from "../lib/profile.ts";
import { scoreHit } from "../lib/score.ts";
import { loadFixtureHits } from "../lib/fixtures.ts";

export default defineTool({
  description: "Score one candidate issue against the preference profile. Prefer search_issues for full ranking.",
  inputSchema: z.object({
    repo: z.string().min(1),
    issue: z.number().int().positive(),
    fixturePath: z.string().optional(),
  }),
  label: {
    start: ({ repo, issue }) => `Score ${repo}#${issue}`,
  },
  async execute(input) {
    const profile = loadProfile();
    const fixturePath = input.fixturePath ?? process.env.CONTRIB_AGENT_FIXTURE ?? "evals/fixtures/search-hits.json";
    const hits = loadFixtureHits(fixturePath);
    const hit = hits.find(
      (item) => item.repo.fullName.toLowerCase() === input.repo.toLowerCase() && item.issue.number === input.issue,
    );
    if (!hit) {
      return { ok: false, reason: "candidate not in fixture set; run search_issues for live scoring" };
    }
    return { ok: true, repo: hit.repo.fullName, issue: hit.issue.number, ...scoreHit(hit, profile) };
  },
});
