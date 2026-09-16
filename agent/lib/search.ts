import type { Candidate, DiscoveryResult, Profile, SkipReason } from "./types.ts";
import type { GitHubClient, GitHubIssueHit } from "./github.ts";
import { filterAndScore } from "./score.ts";

export function buildSearchQueries(profile: Profile): string[] {
  const queries: string[] = [];
  const labels = profile.labels.length > 0 ? profile.labels : ["good first issue"];
  const languages = profile.languages.length > 0 ? profile.languages : ["TypeScript"];

  for (const pin of profile.pins) {
    queries.push(`is:issue is:open repo:${pin}`);
  }

  for (const language of languages) {
    for (const label of labels) {
      queries.push(
        `is:issue is:open no:assignee label:"${label}" language:${language}`,
      );
    }
  }

  return queries;
}

function uniqueHits(hits: GitHubIssueHit[]): GitHubIssueHit[] {
  const seen = new Set<string>();
  const unique: GitHubIssueHit[] = [];
  for (const hit of hits) {
    const key = `${hit.repo.fullName}#${hit.issue.number}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

export async function discover(
  profile: Profile,
  client: GitHubClient,
  options?: { repo?: string; issue?: number },
): Promise<DiscoveryResult> {
  const skipped: SkipReason[] = [];
  let hits: GitHubIssueHit[] = [];

  if (options?.repo && options.issue !== undefined) {
    const repo = await client.getRepo(options.repo);
    const search = await client.searchIssues(`is:issue is:open repo:${options.repo} ${options.issue} in:number`);
    const match = search.find((hit) => hit.issue.number === options.issue) ?? {
      repo,
      issue: {
        number: options.issue,
        title: `Issue #${options.issue}`,
        body: "",
        labels: [],
        comments: 0,
        updatedAt: new Date().toISOString(),
        htmlUrl: `https://github.com/${options.repo}/issues/${options.issue}`,
        hasLinkedPr: false,
        assigneeLogin: null,
      },
    };
    hits = [match];
  } else if (options?.repo) {
    hits = await client.searchIssues(`is:issue is:open repo:${options.repo}`);
  } else {
    const queries = buildSearchQueries(profile);
    for (const query of queries.slice(0, 8)) {
      const page = await client.searchIssues(query, 10);
      hits.push(...page);
    }
  }

  hits = uniqueHits(hits);
  const { candidates, skipped: filtered } = filterAndScore(hits, profile);
  skipped.push(...filtered);
  return { candidates, skipped };
}

export function formatDiscovery(result: DiscoveryResult): string {
  const lines: string[] = [];
  if (result.candidates.length === 0) {
    lines.push("No eligible candidates.");
  } else {
    lines.push("Ranked candidates:");
    result.candidates.forEach((candidate: Candidate, index: number) => {
      lines.push(
        `${index + 1}. ${candidate.repo.fullName}#${candidate.issue.number}  score=${candidate.score}  ${candidate.issue.title}`,
      );
      lines.push(`   ${candidate.issue.htmlUrl}`);
      lines.push(`   ${candidate.reasons.join("; ")}`);
    });
  }
  if (result.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped ${result.skipped.length} issues.`);
  }
  return lines.join("\n");
}
