import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContributorCard, isCardEvalRepo } from "../agent/lib/card.ts";
import { diffPolicy } from "../agent/lib/policy.ts";
import { loadProfile } from "../agent/lib/profile.ts";
import { executeRun } from "../agent/lib/run.ts";
import { fixtureGitHubClient, loadFixtureHits } from "../agent/lib/fixtures.ts";

test("card eval writes a single contributors HTML file", () => {
  const file = buildContributorCard("willchrisjr");
  assert.equal(file.path, "contributors/willchrisjr.html");
  assert.match(file.content, /<article>/);
  assert.equal(isCardEvalRepo("willchrisjr/code-contributions"), true);

  const verdict = diffPolicy({
    files: [file],
    pinned: true,
    issueAsksForWorkflows: false,
  });
  assert.equal(verdict.ok, true);
});

test("run --dry-run against the teaching repo plans a card PR and does not open it", async () => {
  const profile = loadProfile("config/profile.yaml");
  const client = fixtureGitHubClient(loadFixtureHits("evals/fixtures/search-hits.json"));
  const result = await executeRun(
    { ...profile, dryRun: true },
    {
      command: "run",
      dryRun: true,
      repo: "willchrisjr/code-contributions",
      issue: 1,
      profilePath: "config/profile.yaml",
      fixturePath: "evals/fixtures/search-hits.json",
    },
    client,
  );
  assert.equal(result.pullUrl, undefined);
  assert.equal(result.plan?.files.length, 1);
  assert.equal(result.plan?.files[0]?.path.startsWith("contributors/"), true);
  assert.equal(result.plan?.draft, true);
  assert.equal(result.plan?.dryRun, true);
});
