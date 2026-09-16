import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentState, Profile } from "./types.ts";

export function emptyState(): AgentState {
  return { prsOpenedOn: [], attempts: [], rejectedRepos: [] };
}

export function loadState(profile: Profile): AgentState {
  try {
    const text = readFileSync(resolve(profile.statePath), "utf8");
    const parsed = JSON.parse(text) as AgentState;
    return {
      prsOpenedOn: Array.isArray(parsed.prsOpenedOn) ? parsed.prsOpenedOn : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      rejectedRepos: Array.isArray(parsed.rejectedRepos) ? parsed.rejectedRepos : [],
    };
  } catch {
    return emptyState();
  }
}

export function saveState(profile: Profile, state: AgentState): void {
  const path = resolve(profile.statePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
