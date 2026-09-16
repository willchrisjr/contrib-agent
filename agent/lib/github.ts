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

interface SearchIssueItem {
  number: number;
  title: string;
  body: string | null;
  comments: number;
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
  repository_url: string;
  labels: Array<{ name?: string } | string>;
  assignee: { login?: string } | null;
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

export function liveGitHubClient(): GitHubClient {
  const repoCache = new Map<string, RepoInfo>();

  async function github<T>(path: string, init?: RequestInit): Promise<T> {
    const token = requiredToken();
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "contrib-agent",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub ${response.status} ${path}: ${body.slice(0, 400)}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
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
      const params = new URLSearchParams({
        q: query,
        per_page: String(perPage),
        sort: "updated",
        order: "desc",
      });
      const data = await github<{ items: SearchIssueItem[] }>(`/search/issues?${params.toString()}`);
      const hits: GitHubIssueHit[] = [];
      for (const item of data.items) {
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
            hasLinkedPr: item.pull_request !== undefined,
            assigneeLogin: item.assignee?.login ?? null,
          },
        });
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
