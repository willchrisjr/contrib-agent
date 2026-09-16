export interface StarBand {
  min: number;
  max: number;
}

export interface Caps {
  maxPrsPerDay: number;
  maxOpenDraftsPerRepo: number;
  maxAttemptsPerIssue: 1;
}

export interface Denylist {
  orgs: string[];
  repos: string[];
}

export interface Profile {
  languages: string[];
  topics: string[];
  labels: string[];
  preferLabel: string;
  stars: StarBand;
  pushedWithinDays: number;
  issueUpdatedWithinDays: number;
  excludeUnlicensed: boolean;
  excludeArchived: boolean;
  pins: string[];
  denylist: Denylist;
  dryRun: boolean;
  caps: Caps;
  statePath: string;
}

export interface RepoInfo {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string | null;
  archived: boolean;
  license: string | null;
  defaultBranch: string;
  htmlUrl: string;
  hasContributing: boolean;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: number;
  updatedAt: string;
  htmlUrl: string;
  hasLinkedPr: boolean;
  assigneeLogin: string | null;
}

export interface Candidate {
  repo: RepoInfo;
  issue: IssueInfo;
  score: number;
  reasons: string[];
}

export interface SkipReason {
  repo?: string;
  issue?: number;
  reason: string;
}

export interface DiscoveryResult {
  candidates: Candidate[];
  skipped: SkipReason[];
}

export type CommandName = "discover" | "run";

export interface RunRequest {
  command: CommandName;
  dryRun: boolean;
  repo?: string;
  issue?: number;
  profilePath: string;
  fixturePath?: string;
}

export interface AgentState {
  prsOpenedOn: string[];
  attempts: Array<{ repo: string; issue: number; at: string; result: string }>;
  rejectedRepos: string[];
}

export interface DraftPrPlan {
  originRepo: string;
  forkRepo: string;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  files: Array<{ path: string; content: string }>;
  draft: true;
  dryRun: boolean;
}

export interface PolicyVerdict {
  ok: boolean;
  reasons: string[];
}
