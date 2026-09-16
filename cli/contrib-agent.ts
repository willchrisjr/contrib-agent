#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning


import { executeRun } from "../agent/lib/run.ts";
import { resolveClient } from "../agent/lib/client.ts";
import { loadProfile } from "../agent/lib/profile.ts";
import type { CommandName, RunRequest } from "../agent/lib/types.ts";

function printHelp(): void {
  console.log(`contrib-agent

Usage:
  contrib-agent discover [--dry-run] [--fixture <path>] [--repo owner/name]
  contrib-agent run [--dry-run] [--fixture <path>] [--repo owner/name] [--issue N]
  contrib-agent --help

Environment:
  GITHUB_TOKEN | GH_TOKEN | CONTRIB_AGENT_TOKEN
  CONTRIB_AGENT_FIXTURE   recorded search hits JSON
  CONTRIB_AGENT_LOGIN     GitHub login for card evals
`);
}

function isCommand(value: string): value is CommandName {
  return value === "discover" || value === "run";
}

function parseArgs(argv: string[]): RunRequest {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const commandArg = args[0];
  if (!commandArg || !isCommand(commandArg)) {
    throw new Error(`Unknown command: ${commandArg ?? ""}`);
  }
  const command = commandArg;


  let dryRun = command === "discover" || process.env.CONTRIB_AGENT_DRY_RUN === "1";
  let repo: string | undefined;
  let issue: number | undefined;
  let fixturePath = process.env.CONTRIB_AGENT_FIXTURE;
  let profilePath = "config/profile.yaml";

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--repo":
        repo = args[index + 1];
        index += 1;
        break;
      case "--issue":
        issue = Number(args[index + 1]);
        index += 1;
        break;
      case "--fixture":
        fixturePath = args[index + 1];
        index += 1;
        break;
      case "--profile":
        profilePath = args[index + 1] ?? profilePath;
        index += 1;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (issue !== undefined && Number.isNaN(issue)) {
    throw new Error("--issue must be a number");
  }

  return { command, dryRun, repo, issue, profilePath, fixturePath };
}

async function main(): Promise<void> {
  const request = parseArgs(process.argv);
  const profile = loadProfile(request.profilePath);
  const client = resolveClient(request.fixturePath);
  const result = await executeRun(profile, request, client);
  if (result.discovery) {
    console.log(result.discovery);
    console.log("");
  }
  if (result.candidate) {
    console.log(`Top candidate: ${result.candidate.repo.fullName}#${result.candidate.issue.number}`);
  }
  if (result.plan) {
    console.log(`Draft plan: ${result.plan.title}`);
    console.log(`Files: ${result.plan.files.map((file) => file.path).join(", ")}`);
    console.log(`dryRun=${result.plan.dryRun}`);
  }
  if (result.pullUrl) {
    console.log(`Opened draft PR: ${result.pullUrl}`);
  }
  if (result.skipped) {
    console.log(`Skipped: ${result.skipped}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
