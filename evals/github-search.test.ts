import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GITHUB_MAX_ATTEMPTS,
  SEARCH_MAX_PAGES,
  githubRetryDelayMs,
  isSearchPullRequest,
  liveGitHubClient,
} from "../agent/lib/github.ts";

process.env.GITHUB_TOKEN ??= "test-token";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function searchItem(params: {
  repo: string;
  number: number;
  title: string;
  htmlUrl: string;
  url?: string;
  pullRequest?: unknown;
}): {
  number: number;
  title: string;
  body: string;
  comments: number;
  updated_at: string;
  html_url: string;
  url: string;
  pull_request?: unknown;
  repository_url: string;
  labels: string[];
  assignee: null;
} {
  const item = {
    number: params.number,
    title: params.title,
    body: "Please add a short README example for the --json flag so users can copy it.",
    comments: 0,
    updated_at: new Date().toISOString(),
    html_url: params.htmlUrl,
    url: params.url ?? `https://api.github.com/repos/${params.repo}/issues/${params.number}`,
    repository_url: `https://api.github.com/repos/${params.repo}`,
    labels: ["good first issue"],
    assignee: null,
  };
  if (params.pullRequest !== undefined) {
    return { ...item, pull_request: params.pullRequest };
  }
  return item;
}

function repoPayload(fullName: string) {
  const [owner, name] = fullName.split("/");
  return {
    full_name: fullName,
    owner: { login: owner },
    name,
    description: null,
    language: "TypeScript",
    topics: ["cli"],
    stargazers_count: 100,
    pushed_at: new Date().toISOString(),
    archived: false,
    license: { spdx_id: "MIT" },
    default_branch: "main",
    html_url: `https://github.com/${fullName}`,
  };
}

test("isSearchPullRequest detects PRs even without relying on is:issue", () => {
  assert.equal(
    isSearchPullRequest({
      html_url: "https://github.com/example/repo/issues/12",
    }),
    false,
  );
  assert.equal(
    isSearchPullRequest({
      html_url: "https://github.com/example/repo/issues/12",
      pull_request: { url: "https://api.github.com/repos/example/repo/pulls/12" },
    }),
    true,
  );
  assert.equal(
    isSearchPullRequest({
      html_url: "https://github.com/example/repo/pull/12",
    }),
    true,
  );
  assert.equal(
    isSearchPullRequest({
      html_url: "https://github.com/example/repo/issues/12",
      url: "https://api.github.com/repos/example/repo/pulls/12",
    }),
    true,
  );
});

test("githubRetryDelayMs backs off secondary rate limits and honors Retry-After", () => {
  assert.equal(
    githubRetryDelayMs({
      status: 403,
      body: "Resource not accessible by integration",
      retryAfter: null,
      rateLimitRemaining: "5000",
      rateLimitReset: null,
      attempt: 1,
    }),
    null,
  );

  assert.equal(
    githubRetryDelayMs({
      status: 403,
      body: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
      retryAfter: null,
      rateLimitRemaining: "30",
      rateLimitReset: null,
      attempt: 1,
    }),
    20_000,
  );

  assert.equal(
    githubRetryDelayMs({
      status: 403,
      body: "You have exceeded a secondary rate limit.",
      retryAfter: null,
      rateLimitRemaining: "30",
      rateLimitReset: null,
      attempt: 2,
    }),
    40_000,
  );

  assert.equal(
    githubRetryDelayMs({
      status: 429,
      body: "Too many requests",
      retryAfter: "8",
      rateLimitRemaining: null,
      rateLimitReset: null,
      attempt: 1,
    }),
    8_000,
  );
});

function pullRequestItem(repo: string, number: number) {
  return searchItem({
    repo,
    number,
    title: `PR ${number}`,
    htmlUrl: `https://github.com/${repo}/pull/${number}`,
    pullRequest: { url: `https://api.github.com/repos/${repo}/pulls/${number}` },
  });
}

test("searchIssues paginates past PRs and only fetches issue repos", async () => {
  const searchCalls: string[] = [];
  const repoCalls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/search/issues") {
      searchCalls.push(url.searchParams.get("page") ?? "");
      assert.equal(url.searchParams.get("per_page"), "10");
      const page = url.searchParams.get("page");
      if (page === "1") {
        const items = Array.from({ length: 9 }, (_unused, index) => pullRequestItem("example/pr-one", index + 1));
        items.push(
          searchItem({
            repo: "example/real-one",
            number: 10,
            title: "Docs issue",
            htmlUrl: "https://github.com/example/real-one/issues/10",
          }),
        );
        return jsonResponse(200, { items });
      }
      return jsonResponse(200, {
        items: [
          searchItem({
            repo: "example/real-two",
            number: 11,
            title: "Second docs issue",
            htmlUrl: "https://github.com/example/real-two/issues/11",
          }),
          ...Array.from({ length: 9 }, (_unused, index) => pullRequestItem("example/pr-three", index + 1)),
        ],
      });
    }
    const repoMatch = /^\/repos\/([^/]+\/[^/]+)$/.exec(url.pathname);
    if (repoMatch) {
      const fullName = repoMatch[1] ?? "";
      repoCalls.push(fullName);
      return jsonResponse(200, repoPayload(fullName));
    }
    return jsonResponse(404, { message: `unexpected ${url.pathname}` });
  };

  const client = liveGitHubClient({ fetch: fetchFn, sleep: async () => {} });
  const hits = await client.searchIssues("is:issue is:open", 2);

  assert.deepEqual(
    hits.map((hit) => `${hit.repo.fullName}#${hit.issue.number}`),
    ["example/real-one#10", "example/real-two#11"],
  );
  assert.ok(hits.every((hit) => !hit.issue.htmlUrl.includes("/pull/")));
  assert.ok(hits.every((hit) => hit.issue.hasLinkedPr === false));
  assert.deepEqual(searchCalls, ["1", "2"]);
  assert.deepEqual(repoCalls, ["example/real-one", "example/real-two"]);
});

test("searchIssues stops after SEARCH_MAX_PAGES when results are only PRs", async () => {
  let searchCount = 0;
  let repoCount = 0;
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/search/issues") {
      searchCount += 1;
      const perPage = Number(url.searchParams.get("per_page"));
      const items = Array.from({ length: perPage }, (_unused, index) =>
        pullRequestItem("example/only-prs", searchCount * 100 + index),
      );
      return jsonResponse(200, { items });
    }
    repoCount += 1;
    return jsonResponse(200, repoPayload("example/only-prs"));
  };

  const client = liveGitHubClient({ fetch: fetchFn, sleep: async () => {} });
  const hits = await client.searchIssues("is:issue is:open repo:example/only-prs", 3);
  assert.deepEqual(hits, []);
  assert.equal(searchCount, SEARCH_MAX_PAGES);
  assert.equal(repoCount, 0);
});

test("live client retries secondary rate limits then succeeds", async () => {
  const delays: number[] = [];
  let searchAttempts = 0;
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/search/issues") {
      searchAttempts += 1;
      if (searchAttempts === 1) {
        return new Response("You have exceeded a secondary rate limit. Please wait a few minutes before you try again.", {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return jsonResponse(200, {
        items: [
          searchItem({
            repo: "example/real-one",
            number: 4,
            title: "After backoff",
            htmlUrl: "https://github.com/example/real-one/issues/4",
          }),
        ],
      });
    }
    if (url.pathname === "/repos/example/real-one") {
      return jsonResponse(200, repoPayload("example/real-one"));
    }
    return jsonResponse(404, { message: url.pathname });
  };

  const client = liveGitHubClient({
    fetch: fetchFn,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  const hits = await client.searchIssues("is:issue is:open", 1);
  assert.equal(hits[0]?.issue.number, 4);
  assert.deepEqual(delays, [20_000]);
  assert.equal(searchAttempts, 2);
});

test("non-rate-limit 403 is not retried", async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls += 1;
    return new Response("Resource not accessible by integration", { status: 403 });
  };
  const client = liveGitHubClient({ fetch: fetchFn, sleep: async () => {} });
  await assert.rejects(() => client.searchIssues("is:issue"), /GitHub 403/);
  assert.equal(calls, 1);
});

test("retries stop after GITHUB_MAX_ATTEMPTS", async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls += 1;
    return new Response("You have exceeded a secondary rate limit.", { status: 403 });
  };
  const client = liveGitHubClient({ fetch: fetchFn, sleep: async () => {} });
  await assert.rejects(() => client.searchIssues("is:issue"), /secondary rate limit/);
  assert.equal(calls, GITHUB_MAX_ATTEMPTS);
});
