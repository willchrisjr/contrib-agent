import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveClient } from "../lib/client.ts";
import { loadProfile } from "../lib/profile.ts";

export default defineTool({
  description:
    "Fork the origin repository for the authenticated user. In dryRun mode, returns the fork plan without calling GitHub.",
  inputSchema: z.object({
    repo: z.string().min(1),
    dryRun: z.boolean().optional(),
  }),
  label: {
    start: ({ repo }) => `Fork ${repo}`,
  },
  async execute(input) {
    const profile = loadProfile();
    const dryRun = input.dryRun ?? profile.dryRun;
    if (dryRun) {
      return {
        dryRun: true,
        originRepo: input.repo,
        action: "would fork into the authenticated user's account",
      };
    }
    const client = resolveClient();
    const fork = await client.forkRepo(input.repo);
    return { dryRun: false, originRepo: input.repo, fork };
  },
});
