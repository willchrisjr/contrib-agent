import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixtureHits } from "../agent/lib/fixtures.ts";
import { loadProfile } from "../agent/lib/profile.ts";
import { filterAndScore } from "../agent/lib/score.ts";
import { executeRun } from "../agent/lib/run.ts";
import { fixtureGitHubClient } from "../agent/lib/fixtures.ts";

const fixturePath = "evals/fixtures/search-hits.json";

test("discover ranking prefers the pinned card issue and drops denylisted or invalid repos", () => {
  const profile = loadProfile("config/profile.yaml");
  const hits = loadFixtureHits(fixturePath);
  const { candidates, skipped } = filterAndScore(hits, profile);

  assert.equal(candidates[0]?.repo.fullName, "willchrisjr/code-contributions");
  assert.equal(candidates[0]?.issue.number, 1);
  assert.ok((candidates[0]?.score ?? 0) > (candidates[1]?.score ?? 0));

  const second = candidates.find((item) => item.repo.fullName === "example/small-cli");
  assert.ok(second);
  const vague = candidates.find((item) => item.repo.fullName === "example/vague-app");
  assert.ok(vague);
  assert.ok(second.score > vague.score);

  const skippedRepos = skipped.map((item) => item.repo);
  assert.ok(skippedRepos.includes("kubernetes/kubernetes"));
  assert.ok(skippedRepos.includes("example/archived-lib"));
  assert.ok(skippedRepos.includes("example/unlicensed"));
  assert.ok(skippedRepos.includes("example/linked-pr"));
});

test("discover --dry-run prints ranked candidates and does not open a PR", async () => {
  const profile = loadProfile("config/profile.yaml");
  const client = fixtureGitHubClient(loadFixtureHits(fixturePath));
  const result = await executeRun(
    profile,
    {
      command: "discover",
      dryRun: true,
      profilePath: "config/profile.yaml",
      fixturePath,
    },
    client,
  );
  assert.equal(result.dryRun, true);
  assert.equal(result.pullUrl, undefined);
  assert.match(result.discovery ?? "", /willchrisjr\/code-contributions#1/);
});
