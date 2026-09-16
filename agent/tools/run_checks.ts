import { defineTool } from "eve/tools";
import { z } from "zod";
import { diffPolicy, isPinned } from "../lib/policy.ts";
import { loadProfile } from "../lib/profile.ts";

export default defineTool({
  description:
    "Check a proposed file diff against contrib-agent policy: no secrets, size cap, no workflow edits unless pinned.",
  inputSchema: z.object({
    repo: z.string().min(1),
    issueTitle: z.string().optional(),
    issueBody: z.string().optional(),
    files: z.array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
    ),
  }),
  label: {
    start: ({ repo }) => `Check diff for ${repo}`,
  },
  async execute(input) {
    const profile = loadProfile();
    const issueText = `${input.issueTitle ?? ""}\n${input.issueBody ?? ""}`.toLowerCase();
    const verdict = diffPolicy({
      files: input.files,
      pinned: isPinned(input.repo, profile),
      issueAsksForWorkflows: issueText.includes(".github/workflows") || issueText.includes("github actions"),
    });
    return verdict;
  },
});
