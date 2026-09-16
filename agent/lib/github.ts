import type { IssueInfo, RepoInfo } from "./types.ts";

export interface GitHubIssueHit {
  repo: RepoInfo;
  issue: IssueInfo;
}

export interface GitHubUser {
  login: string;
}

export interface ForkResult {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
  draft: boolean;
}

export interface GitHubClient {
  searchIssues(query: string, perPage?: number): Promise<GitHubIssueHit[]>;
  getRepo(fullName: string): Promise<RepoInfo>;
  getAuthenticatedUser(): Promise<GitHubUser>;
  forkRepo(fullName: string): Promise<ForkResult>;
  createBranch(forkFullName: string, branch: string, fromSha: string): Promise<void>;
  getBranchSha(fullName: string, branch: string): Promise<string>;
  putFile(params: {
    repo: string;
    path: string;
    content: string;
    message: string;
    branch: string;
  }): Promise<void>;
  createDraftPullRequest(params: {
    originRepo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<PullRequestResult>;
  listOpenDraftPulls(originRepo: string, headRepo: string): Promise<number>;
}

export const SEARCH_MAX_PAGES = 2;
export const GITHUB_MAX_ATTEMPTS = 5;
export const SEARCH_MIN_INTERVAL_MS = 20_000;
const RETRY_DELAY_CAP_MS = 120_000;

export interface LiveGitHubClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function githubToken(): string | undefined {
  return process.env.CONTRIB_AGENT_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
}

function requiredToken(): string {
  const token = githubToken();
  if (!token) {
    throw new Error("Set GITHUB_TOKEN, GH_TOKEN, or CONTRIB_AGENT_TOKEN");
  }
  return token;
}

export interface SearchIssueItem {
  number: number;
  title: string;
  body: string | null;
  comments: number;
  updated_at: string;
  html_url: string;
  url?: string;
  pull_request?: unknown;
  repository_url: string;
  labels: Array<{ name?: string } | string>;
  assignee: { login?: string } | null;
}

export function isSearchPullRequest(item: {
  pull_request?: unknown;
  html_url?: string;
  url?: string;
}): boolean {
  if (item.pull_request != null) {
    return true;
  }
  const htmlUrl = item.html_url ?? "";
  if (/\/pull\/\d+(?:$|[?#/])/.test(htmlUrl)) {
    return true;
  }
  const apiUrl = item.url ?? "";
  return /\/pulls\/\d+(?:$|[?#/])/.test(apiUrl);
}

export function githubRetryDelayMs(input: {
  status: number;
  body: string;
  retryAfter: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  attempt: number;
}): number | null {
  const { status, body, retryAfter, rateLimitRemaining, rateLimitReset, attempt } = input;
  if (status !== 403 && status !== 429) {
    return null;
  }
  const lower = body.toLowerCase();
  const secondary = lower.includes("secondary rate limit");
  const primary = rateLimitRemaining === "0" || lower.includes("rate limit");
  if (status !== 429 && !secondary && !primary) {
    return null;
  }
  const retryAfterSeconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(Math.max(retryAfterSeconds, 1) * 1000, RETRY_DELAY_CAP_MS);
  }
  if (!secondary && rateLimitRemaining === "0" && rateLimitReset) {
    const resetMs = Number(rateLimitReset) * 1000 - Date.now();
    if (Number.isFinite(resetMs) && resetMs > 0) {
      return Math.min(resetMs + 1000, RETRY_DELAY_CAP_MS);
    }
  }
  const base = secondary ? 60_000 : 5_000;
  const exp = Math.max(attempt, 1) - 1;
  return Math.min(base * 2 ** exp, RETRY_DELAY_CAP_MS);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function searchApiPerPage(perPage: number): number {
  return Math.min(100, Math.max(perPage * 10, perPage));
}

interface RepoPayload {
  full_name: string;
  owner: { login: string };
  name: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string | null;
  archived: boolean;
  license: { spdx_id?: string } | null;
  default_branch: string;
  html_url: string;
}

function labelsOf(item: SearchIssueItem): string[] {
  return item.labels.map((label) => (typeof label === "string" ? label : (label.name ?? ""))).filter(Boolean);
}

function repoFromPayload(payload: RepoPayload): RepoInfo {
  return {
    fullName: payload.full_name,
    owner: payload.owner.login,
    name: payload.name,
    description: payload.description,
    language: payload.language,
    topics: payload.topics ?? [],
    stars: payload.stargazers_count,
    pushedAt: payload.pushed_at,
    archived: payload.archived,
    license: payload.license?.spdx_id === "NOASSERTION" ? null : (payload.license?.spdx_id ?? null),
    defaultBranch: payload.default_branch,
    htmlUrl: payload.html_url,
    hasContributing: false,
  };
}

export function liveGitHubClient(options?: LiveGitHubClientOptions): GitHubClient {
  const repoCache = new Map<string, RepoInfo>();
  const fetchFn = options?.fetch ?? fetch;
  const sleep = options?.sleep ?? wait;
  let lastSearchAt = 0;

  async function throttleSearch(): Promise<void> {
    const elapsed = Date.now() - lastSearchAt;
    if (lastSearchAt > 0 && elapsed < SEARCH_MIN_INTERVAL_MS) {
      await sleep(SEARCH_MIN_INTERVAL_MS - elapsed);
    }
    lastSearchAt = Date.now();
  }

  async function github<T>(path: string, init?: RequestInit): Promise<T> {
    const token = requiredToken();
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= GITHUB_MAX_ATTEMPTS; attempt += 1) {
      const response = await fetchFn(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "contrib-agent",
          ...(init?.headers ?? {}),
        },
      });
      if (response.ok) {
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      }
      const body = await response.text();
      lastError = new Error(`GitHub ${response.status} ${path}: ${body.slice(0, 400)}`);
      const delay = githubRetryDelayMs({
        status: response.status,
        body,
        retryAfter: response.headers.get("retry-after"),
        rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
        rateLimitReset: response.headers.get("x-ratelimit-reset"),
        attempt,
      });
      if (delay === null || attempt >= GITHUB_MAX_ATTEMPTS) {
        throw lastError;
      }
      console.error(`GitHub ${response.status} ${path.split("?")[0]}: rate limited, retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
    throw lastError ?? new Error(`GitHub request failed: ${path}`);
  }

  async function getRepo(fullName: string): Promise<RepoInfo> {
    const cached = repoCache.get(fullName.toLowerCase());
    if (cached) {
      return cached;
    }
    const payload = await github<RepoPayload>(`/repos/${fullName}`);
    const repo = repoFromPayload(payload);
    repoCache.set(fullName.toLowerCase(), repo);
    return repo;
  }

  return {
    async searchIssues(query: string, perPage = 20): Promise<GitHubIssueHit[]> {
      const hits: GitHubIssueHit[] = [];
      const apiPerPage = searchApiPerPage(perPage);
      let page = 1;
      while (hits.length < perPage && page <= SEARCH_MAX_PAGES) {
        await throttleSearch();
        const params = new URLSearchParams({
          q: query,
          per_page: String(apiPerPage),
          page: String(page),
          sort: "updated",
          order: "desc",
        });
        const data = await github<{ items?: SearchIssueItem[] }>(`/search/issues?${params.toString()}`);
        const items = data.items ?? [];
        if (items.length === 0) {
          break;
        }
        for (const item of items) {
          if (isSearchPullRequest(item)) {
            continue;
          }
          const repoFullName = item.repository_url.replace("https://api.github.com/repos/", "");
          const repo = await getRepo(repoFullName);
          hits.push({
            repo,
            issue: {
              number: item.number,
              title: item.title,
              body: item.body ?? "",
              labels: labelsOf(item),
              comments: item.comments,
              updatedAt: item.updated_at,
              htmlUrl: item.html_url,
              hasLinkedPr: false,
              assigneeLogin: item.assignee?.login ?? null,
            },
          });
          if (hits.length >= perPage) {
            break;
          }
        }
        if (items.length < apiPerPage) {
          break;
        }
        page += 1;
      }
      return hits;
    },
    getRepo,
    async getAuthenticatedUser() {
      return github<GitHubUser>("/user");
    },
    async forkRepo(fullName: string) {
      const payload = await github<RepoPayload & { clone_url: string }>(`/repos/${fullName}/forks`, {
        method: "POST",
      });
      return {
        fullName: payload.full_name,
        cloneUrl: payload.clone_url,
        defaultBranch: payload.default_branch,
      };
    },
    async getBranchSha(fullName: string, branch: string) {
      const payload = await github<{ object: { sha: string } }>(`/repos/${fullName}/git/ref/heads/${branch}`);
      return payload.object.sha;
    },
    async createBranch(forkFullName: string, branch: string, fromSha: string) {
      await github(`/repos/${forkFullName}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
      });
    },
    async putFile(params) {
      await github(`/repos/${params.repo}/contents/${params.path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: params.message,
          content: Buffer.from(params.content).toString("base64"),
          branch: params.branch,
        }),
      });
    },
    async createDraftPullRequest(params) {
      const payload = await github<{ number: number; html_url: string; draft: boolean }>(`/repos/${params.originRepo}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          head: params.head,
          base: params.base,
          draft: true,
        }),
      });
      return { number: payload.number, htmlUrl: payload.html_url, draft: payload.draft };
    },
    async listOpenDraftPulls(originRepo: string, headRepo: string) {
      const params = new URLSearchParams({ state: "open", per_page: "20" });
      const pulls = await github<Array<{ draft: boolean; head: { repo: { full_name: string } | null } }>>(`/repos/${originRepo}/pulls?${params.toString()}`);
      return pulls.filter((pull) => pull.draft && pull.head.repo?.full_name.toLowerCase() === headRepo.toLowerCase()).length;
    },
  };
}
