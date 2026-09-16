import type { AgentState, Candidate, PolicyVerdict, Profile } from "./types.ts";
import { utcDay } from "./state.ts";

const BOT_FORBIDDEN_RE =
  /\b(no bots|do not submit automated|automated pull requests are not|we do not accept bot)\b/i;
const SECRET_RE = /\b(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-)\b/;

export function contributingForbidsBots(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return BOT_FORBIDDEN_RE.test(text);
}

export function capVerdict(candidate: Candidate, profile: Profile, state: AgentState): PolicyVerdict {
  const reasons: string[] = [];
  const today = utcDay();
  const openedToday = state.prsOpenedOn.filter((day) => day === today).length;
  if (openedToday >= profile.caps.maxPrsPerDay) {
    reasons.push(`daily cap reached (${profile.caps.maxPrsPerDay})`);
  }

  const issueAttempts = state.attempts.filter(
    (attempt) =>
      attempt.repo.toLowerCase() === candidate.repo.fullName.toLowerCase() &&
      attempt.issue === candidate.issue.number,
  );
  if (issueAttempts.length >= profile.caps.maxAttemptsPerIssue) {
    reasons.push("already attempted this issue");
  }

  if (state.rejectedRepos.map((repo) => repo.toLowerCase()).includes(candidate.repo.fullName.toLowerCase())) {
    reasons.push("repo previously rejected an agent PR");
  }

  return { ok: reasons.length === 0, reasons };
}

export function diffPolicy(params: {
  files: Array<{ path: string; content: string }>;
  pinned: boolean;
  issueAsksForWorkflows: boolean;
}): PolicyVerdict {
  const reasons: string[] = [];
  for (const file of params.files) {
    if (file.path.includes("..") || file.path.startsWith("/")) {
      reasons.push(`illegal path ${file.path}`);
      continue;
    }
    if (file.path.startsWith(".github/workflows")) {
      if (!params.pinned || !params.issueAsksForWorkflows) {
        reasons.push("workflow edits require a pin and an explicit issue");
      }
    }
    if (file.content.length > 12_000) {
      reasons.push(`${file.path} exceeds 12KB`);
    }
    if (SECRET_RE.test(file.content)) {
      reasons.push(`${file.path} looks like it contains a secret`);
    }
  }
  if (params.files.length === 0) {
    reasons.push("no files to change");
  }
  return { ok: reasons.length === 0, reasons };
}

export function isPinned(repo: string, profile: Profile): boolean {
  return profile.pins.map((pin) => pin.toLowerCase()).includes(repo.toLowerCase());
}
