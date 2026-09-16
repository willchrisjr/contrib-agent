import type { Candidate, Profile, RepoInfo, SkipReason } from "./types.ts";
import type { GitHubIssueHit } from "./github.ts";

const VAGUE_RE = /\b(rewrite|redesign|from scratch|overhaul|rearchitect)\b/i;
const HUGE_RE = /\b(entire codebase|whole system|all modules)\b/i;

function daysAgo(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return null;
  }
  return (Date.now() - then) / 86_400_000;
}

export function isDenied(repo: RepoInfo, profile: Profile): string | null {
  const full = repo.fullName.toLowerCase();
  const org = repo.owner.toLowerCase();
  if (profile.denylist.orgs.includes(org)) {
    return `denylist org ${repo.owner}`;
  }
  if (profile.denylist.repos.includes(full)) {
    return `denylist repo ${repo.fullName}`;
  }
  return null;
}

export function skipHit(hit: GitHubIssueHit, profile: Profile): string | null {
  const denied = isDenied(hit.repo, profile);
  if (denied) {
    return denied;
  }
  if (hit.issue.hasLinkedPr) {
    return "issue already has a linked pull request";
  }
  if (profile.excludeArchived && hit.repo.archived) {
    return "archived repository";
  }
  if (profile.excludeUnlicensed && !hit.repo.license) {
    return "no license";
  }
  if (hit.repo.stars < profile.stars.min) {
    return `stars ${hit.repo.stars} below min ${profile.stars.min}`;
  }
  if (hit.repo.stars > profile.stars.max) {
    return `stars ${hit.repo.stars} above max ${profile.stars.max}`;
  }
  const pushed = daysAgo(hit.repo.pushedAt);
  if (pushed !== null && pushed > profile.pushedWithinDays) {
    return `repo idle for ${Math.round(pushed)} days`;
  }
  const issueAge = daysAgo(hit.issue.updatedAt);
  if (issueAge !== null && issueAge > profile.issueUpdatedWithinDays) {
    return `issue stale for ${Math.round(issueAge)} days`;
  }
  return null;
}

export function scoreHit(hit: GitHubIssueHit, profile: Profile): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const labels = hit.issue.labels.map((label) => label.toLowerCase());

  if (labels.includes(profile.preferLabel.toLowerCase())) {
    score += 25;
    reasons.push(`has ${profile.preferLabel}`);
  }
  if (labels.some((label) => label === "good first issue" || label === "good-first-issue")) {
    score += 15;
    reasons.push("good first issue");
  }
  if (labels.includes("help wanted") || labels.includes("help-wanted")) {
    score += 10;
    reasons.push("help wanted");
  }
  if (labels.includes("bug")) {
    score += 5;
    reasons.push("bug");
  }

  const language = hit.repo.language?.toLowerCase() ?? "";
  if (language && profile.languages.some((item) => item.toLowerCase() === language)) {
    score += 10;
    reasons.push(`language ${hit.repo.language}`);
  }

  const topics = hit.repo.topics.map((topic) => topic.toLowerCase());
  const topicHits = profile.topics.filter((topic) => topics.includes(topic.toLowerCase()));
  if (topicHits.length > 0) {
    score += 8 * topicHits.length;
    reasons.push(`topics ${topicHits.join(",")}`);
  }

  const pushed = daysAgo(hit.repo.pushedAt);
  if (pushed !== null && pushed <= 30) {
    score += 10;
    reasons.push("repo active this month");
  } else if (pushed !== null && pushed <= 90) {
    score += 5;
    reasons.push("repo active this quarter");
  }

  const issueAge = daysAgo(hit.issue.updatedAt);
  if (issueAge !== null && issueAge <= 14) {
    score += 5;
    reasons.push("issue recently updated");
  }

  const body = hit.issue.body.trim();
  if (body.length >= 80 && body.length <= 4000) {
    score += 8;
    reasons.push("actionable issue body");
  } else if (body.length < 80) {
    score -= 15;
    reasons.push("issue body too short");
  } else {
    score -= 10;
    reasons.push("issue body very long");
  }

  if (VAGUE_RE.test(hit.issue.title) || VAGUE_RE.test(body) || HUGE_RE.test(body)) {
    score -= 20;
    reasons.push("looks huge or vague");
  }

  if (hit.issue.assigneeLogin) {
    score -= 8;
    reasons.push("already assigned");
  }

  if (profile.pins.map((pin) => pin.toLowerCase()).includes(hit.repo.fullName.toLowerCase())) {
    score += 12;
    reasons.push("pinned repo");
  }

  return { score, reasons };
}

export function filterAndScore(
  hits: GitHubIssueHit[],
  profile: Profile,
): { candidates: Candidate[]; skipped: SkipReason[] } {
  const skipped: SkipReason[] = [];
  const candidates: Candidate[] = [];

  for (const hit of hits) {
    const reason = skipHit(hit, profile);
    if (reason) {
      skipped.push({ repo: hit.repo.fullName, issue: hit.issue.number, reason });
      continue;
    }
    const { score, reasons } = scoreHit(hit, profile);
    candidates.push({
      repo: hit.repo,
      issue: hit.issue,
      score,
      reasons,
    });
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.repo.fullName.localeCompare(right.repo.fullName) || left.issue.number - right.issue.number;
  });

  return { candidates, skipped };
}
