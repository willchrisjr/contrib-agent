import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GitHubClient, GitHubIssueHit } from "./github.ts";
import type { IssueInfo, RepoInfo } from "./types.ts";

interface FixtureHit {
  repo: RepoInfo;
  issue: IssueInfo;
}

export function loadFixtureHits(fixturePath: string): GitHubIssueHit[] {
  const recent = new Date().toISOString();
  const text = readFileSync(resolve(fixturePath), "utf8").replaceAll("REPLACE_RECENT", recent);
  const parsed = JSON.parse(text) as { hits: FixtureHit[] };
  return parsed.hits;
}

export function fixtureGitHubClient(hits: GitHubIssueHit[]): GitHubClient {
  return {
    async searchIssues(query: string) {
      const repoMatch = /repo:(\S+)/.exec(query);
      const numberMatch = /\b(\d+)\s+in:number\b/.exec(query);
      return hits.filter((hit) => {
        if (repoMatch && hit.repo.fullName.toLowerCase() !== repoMatch[1].toLowerCase()) {
          return false;
        }
        if (numberMatch && hit.issue.number !== Number(numberMatch[1])) {
          return false;
        }
        return true;
      });
    },
    async getRepo(fullName: string) {
      const hit = hits.find((item) => item.repo.fullName.toLowerCase() === fullName.toLowerCase());
      if (!hit) {
        throw new Error(`fixture repo not found: ${fullName}`);
      }
      return hit.repo;
    },
    async getAuthenticatedUser() {
      return { login: "contrib-agent" };
    },
    async forkRepo(fullName: string) {
      return {
        fullName: `contrib-agent/${fullName.split("/")[1]}`,
        cloneUrl: `https://github.com/contrib-agent/${fullName.split("/")[1]}.git`,
        defaultBranch: "main",
      };
    },
    async getBranchSha() {
      return "abc123";
    },
    async createBranch() {},
    async putFile() {},
    async createDraftPullRequest() {
      return { number: 1, htmlUrl: "https://github.com/example/repo/pull/1", draft: true };
    },
    async listOpenDraftPulls() {
      return 0;
    },
  };
}
