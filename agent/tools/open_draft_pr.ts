import { defineTool } from "eve/tools";
import { z } from "zod";
import { capVerdict, diffPolicy, isPinned } from "../lib/policy.ts";
import { loadProfile } from "../lib/profile.ts";
import { resolveClient } from "../lib/client.ts";
import { loadState, saveState, utcDay } from "../lib/state.ts";
import type { Candidate } from "../lib/types.ts";

export default defineTool({
  description:
    "Open a draft pull request from the authenticated user's fork. Always draft. Respects dryRun and daily caps.",
  inputSchema: z.object({
    originRepo: z.string().min(1),
    issue: z.number().int().positive(),
    title: z.string().min(1),
    body: z.string().min(1),
    headBranch: z.string().min(1),
    baseBranch: z.string().min(1),
    files: z.array(z.object({ path: z.string(), content: z.string() })),
    dryRun: z.boolean().optional(),
  }),
  label: {
    start: ({ originRepo, issue }) => `Draft PR for ${originRepo}#${issue}`,
  },
  async execute(input) {
    const profile = loadProfile();
    const dryRun = input.dryRun ?? profile.dryRun;
    const [owner] = input.originRepo.split("/");
    const candidate = {
      repo: {
        fullName: input.originRepo,
        owner: owner ?? "unknown",
        name: input.originRepo.split("/")[1] ?? input.originRepo,
        description: null,
        language: null,
        topics: [],
        stars: profile.stars.min,
        pushedAt: new Date().toISOString(),
        archived: false,
        license: "MIT",
        defaultBranch: input.baseBranch,
        htmlUrl: `https://github.com/${input.originRepo}`,
        hasContributing: true,
      },
      issue: {
        number: input.issue,
        title: input.title,
        body: input.body,
        labels: [],
        comments: 0,
        updatedAt: new Date().toISOString(),
        htmlUrl: `https://github.com/${input.originRepo}/issues/${input.issue}`,
        hasLinkedPr: false,
        assigneeLogin: null,
      },
      score: 0,
      reasons: [],
    } satisfies Candidate;

    const state = loadState(profile);
    const caps = capVerdict(candidate, profile, state);
    if (!caps.ok) {
      return { ok: false, dryRun, reasons: caps.reasons };
    }

    const diff = diffPolicy({
      files: input.files,
      pinned: isPinned(input.originRepo, profile),
      issueAsksForWorkflows: input.body.toLowerCase().includes(".github/workflows"),
    });
    if (!diff.ok) {
      return { ok: false, dryRun, reasons: diff.reasons };
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        wouldOpen: {
          originRepo: input.originRepo,
          title: input.title,
          headBranch: input.headBranch,
          files: input.files.map((file) => file.path),
        },
      };
    }

    const client = resolveClient();
    const user = await client.getAuthenticatedUser();
    const fork = await client.forkRepo(input.originRepo);
    const sha = await client.getBranchSha(fork.fullName, input.baseBranch);
    await client.createBranch(fork.fullName, input.headBranch, sha);
    for (const file of input.files) {
      await client.putFile({
        repo: fork.fullName,
        path: file.path,
        content: file.content,
        message: input.title,
        branch: input.headBranch,
      });
    }
    const pull = await client.createDraftPullRequest({
      originRepo: input.originRepo,
      title: input.title,
      body: input.body,
      head: `${user.login}:${input.headBranch}`,
      base: input.baseBranch,
    });
    state.prsOpenedOn.push(utcDay());
    state.attempts.push({
      repo: input.originRepo,
      issue: input.issue,
      at: new Date().toISOString(),
      result: "opened-draft",
    });
    saveState(profile, state);
    return { ok: true, dryRun: false, pull };
  },
});
