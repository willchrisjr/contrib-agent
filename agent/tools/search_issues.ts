import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveClient } from "../lib/client.ts";
import { loadProfile } from "../lib/profile.ts";
import { discover, formatDiscovery } from "../lib/search.ts";

export default defineTool({
  description:
    "Search GitHub for issues matching the preference profile. Use dryRun to rank without opening PRs. Pass fixturePath to score recorded hits.",
  inputSchema: z.object({
    dryRun: z.boolean().optional(),
    repo: z.string().optional(),
    issue: z.number().int().positive().optional(),
    fixturePath: z.string().optional(),
  }),
  label: {
    start: () => "Search GitHub issues",
  },
  async execute(input) {
    const profile = loadProfile();
    const client = resolveClient(input.fixturePath);
    const result = await discover(profile, client, { repo: input.repo, issue: input.issue });
    return {
      dryRun: input.dryRun ?? true,
      listing: formatDiscovery(result),
      candidates: result.candidates.slice(0, 10).map((candidate) => ({
        repo: candidate.repo.fullName,
        issue: candidate.issue.number,
        title: candidate.issue.title,
        url: candidate.issue.htmlUrl,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
      skippedCount: result.skipped.length,
    };
  },
});
