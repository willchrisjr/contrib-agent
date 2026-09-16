import { capVerdict, diffPolicy, isPinned } from "./policy.ts";
import { buildContributorCard, isCardEvalRepo } from "./card.ts";
import { liveGitHubClient, type GitHubClient } from "./github.ts";
import { discover, formatDiscovery } from "./search.ts";
import { loadState, saveState, utcDay } from "./state.ts";
import type { Candidate, DraftPrPlan, Profile, RunRequest } from "./types.ts";

export interface RunResult {
  dryRun: boolean;
  skipped?: string;
  discovery?: string;
  candidate?: Candidate;
  plan?: DraftPrPlan;
  pullUrl?: string;
}

function issueAsksForWorkflows(candidate: Candidate): boolean {
  const text = `${candidate.issue.title}\n${candidate.issue.body}`.toLowerCase();
  return text.includes(".github/workflows") || text.includes("github actions");
}

export function planForCandidate(candidate: Candidate, profile: Profile, dryRun: boolean): DraftPrPlan | { skip: string } {
  if (!isCardEvalRepo(candidate.repo.fullName)) {
    return {
      skip: "generic implement is handled by the eve sandbox agent; CLI run only auto-implements code-contributions card evals",
    };
  }
  const file = buildContributorCard();
  const files = [file];
  const verdict = diffPolicy({
    files,
    pinned: isPinned(candidate.repo.fullName, profile),
    issueAsksForWorkflows: issueAsksForWorkflows(candidate),
  });
  if (!verdict.ok) {
    return { skip: verdict.reasons.join("; ") };
  }
  const login = file.path.replace("contributors/", "").replace(".html", "");
  return {
    originRepo: candidate.repo.fullName,
    forkRepo: "",
    title: `add ${login} contributor card`,
    body: `Fixes #${candidate.issue.number}\n\nAdds a contributor card via contrib-agent.\n\nHow tested: HTML fragment matches the teaching-repo template; no other paths touched.`,
    headBranch: `add-${login}`,
    baseBranch: candidate.repo.defaultBranch,
    files,
    draft: true,
    dryRun,
  };
}

async function openPlan(client: GitHubClient, plan: DraftPrPlan): Promise<string> {
  const user = await client.getAuthenticatedUser();
  const fork = await client.forkRepo(plan.originRepo);
  const sha = await client.getBranchSha(fork.fullName, plan.baseBranch);
  await client.createBranch(fork.fullName, plan.headBranch, sha);
  for (const file of plan.files) {
    await client.putFile({
      repo: fork.fullName,
      path: file.path,
      content: file.content,
      message: plan.title,
      branch: plan.headBranch,
    });
  }
  const pull = await client.createDraftPullRequest({
    originRepo: plan.originRepo,
    title: plan.title,
    body: plan.body,
    head: `${user.login}:${plan.headBranch}`,
    base: plan.baseBranch,
  });
  return pull.htmlUrl;
}

export async function executeRun(
  profile: Profile,
  request: RunRequest,
  client: GitHubClient = liveGitHubClient(),
): Promise<RunResult> {
  const dryRun = request.dryRun || profile.dryRun;
  const discovery = await discover(profile, client, { repo: request.repo, issue: request.issue });
  const listing = formatDiscovery(discovery);
  const candidate = discovery.candidates[0];
  if (!candidate) {
    return { dryRun, discovery: listing, skipped: "no eligible candidates" };
  }

  if (request.command === "discover") {
    return { dryRun: true, discovery: listing, candidate };
  }

  const state = loadState(profile);
  const caps = capVerdict(candidate, profile, state);
  if (!caps.ok) {
    return { dryRun, discovery: listing, candidate, skipped: caps.reasons.join("; ") };
  }

  const planned = planForCandidate(candidate, profile, dryRun);
  if ("skip" in planned) {
    return { dryRun, discovery: listing, candidate, skipped: planned.skip };
  }

  if (dryRun) {
    return { dryRun: true, discovery: listing, candidate, plan: planned };
  }

  const pullUrl = await openPlan(client, planned);
  state.prsOpenedOn.push(utcDay());
  state.attempts.push({
    repo: candidate.repo.fullName,
    issue: candidate.issue.number,
    at: new Date().toISOString(),
    result: "opened-draft",
  });
  saveState(profile, state);
  return { dryRun: false, discovery: listing, candidate, plan: planned, pullUrl };
}
