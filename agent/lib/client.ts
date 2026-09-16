import { liveGitHubClient, type GitHubClient } from "./github.ts";
import { fixtureGitHubClient, loadFixtureHits } from "./fixtures.ts";

export function resolveClient(fixturePath?: string): GitHubClient {
  const path = fixturePath ?? process.env.CONTRIB_AGENT_FIXTURE;
  if (path) {
    return fixtureGitHubClient(loadFixtureHits(path));
  }
  return liveGitHubClient();
}
