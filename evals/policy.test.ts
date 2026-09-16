import assert from "node:assert/strict";
import { test } from "node:test";
import { capVerdict, contributingForbidsBots, diffPolicy } from "../agent/lib/policy.ts";
import { emptyState } from "../agent/lib/state.ts";
import { loadProfile } from "../agent/lib/profile.ts";
import { utcDay } from "../agent/lib/state.ts";
import type { Candidate } from "../agent/lib/types.ts";

function candidate(): Candidate {
  return {
    repo: {
      fullName: "example/small-cli",
      owner: "example",
      name: "small-cli",
      description: null,
      language: "TypeScript",
      topics: [],
      stars: 100,
      pushedAt: new Date().toISOString(),
      archived: false,
      license: "MIT",
      defaultBranch: "main",
      htmlUrl: "https://github.com/example/small-cli",
      hasContributing: true,
    },
    issue: {
      number: 12,
      title: "docs",
      body: "Add a README example for the --json flag so new users can copy it.",
      labels: ["good first issue"],
      comments: 0,
      updatedAt: new Date().toISOString(),
      htmlUrl: "https://github.com/example/small-cli/issues/12",
      hasLinkedPr: false,
      assigneeLogin: null,
    },
    score: 40,
    reasons: [],
  };
}

test("workflow diffs are blocked unless the repo is pinned and the issue asks", () => {
  const blocked = diffPolicy({
    files: [{ path: ".github/workflows/ci.yml", content: "name: ci\n" }],
    pinned: false,
    issueAsksForWorkflows: true,
  });
  assert.equal(blocked.ok, false);

  const allowed = diffPolicy({
    files: [{ path: ".github/workflows/ci.yml", content: "name: ci\n" }],
    pinned: true,
    issueAsksForWorkflows: true,
  });
  assert.equal(allowed.ok, true);
});

test("daily cap and repeat attempts skip the candidate", () => {
  const profile = loadProfile("config/profile.yaml");
  const item = candidate();
  const state = emptyState();
  state.prsOpenedOn.push(utcDay());
  const capped = capVerdict(item, profile, state);
  assert.equal(capped.ok, false);

  const attempted = emptyState();
  attempted.attempts.push({
    repo: item.repo.fullName,
    issue: 12,
    at: new Date().toISOString(),
    result: "opened-draft",
  });
  const again = capVerdict(item, profile, attempted);
  assert.equal(again.ok, false);
});

test("CONTRIBUTING text that forbids bots is detected", () => {
  assert.equal(contributingForbidsBots("We do not accept bot PRs."), true);
  assert.equal(contributingForbidsBots("PRs welcome."), false);
});
