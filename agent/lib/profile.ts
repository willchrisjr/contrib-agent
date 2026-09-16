import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { Profile } from "./types.ts";

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function defaultProfile(): Profile {
  return {
    languages: ["TypeScript", "JavaScript", "HTML"],
    topics: [],
    labels: ["good first issue", "help wanted"],
    preferLabel: "contrib-agent",
    stars: { min: 10, max: 20000 },
    pushedWithinDays: 90,
    issueUpdatedWithinDays: 60,
    excludeUnlicensed: true,
    excludeArchived: true,
    pins: ["willchrisjr/code-contributions"],
    denylist: { orgs: [], repos: [] },
    dryRun: true,
    caps: {
      maxPrsPerDay: 1,
      maxOpenDraftsPerRepo: 1,
      maxAttemptsPerIssue: 1,
    },
    statePath: ".contrib-agent/state.json",
  };
}

export function parseProfile(raw: unknown): Profile {
  const base = defaultProfile();
  if (raw === null || typeof raw !== "object") {
    return base;
  }
  const data = raw as Record<string, unknown>;
  const stars = data.stars !== null && typeof data.stars === "object" ? (data.stars as Record<string, unknown>) : {};
  const denylist =
    data.denylist !== null && typeof data.denylist === "object"
      ? (data.denylist as Record<string, unknown>)
      : {};
  const caps = data.caps !== null && typeof data.caps === "object" ? (data.caps as Record<string, unknown>) : {};

  return {
    languages: asStringArray(data.languages, base.languages),
    topics: asStringArray(data.topics, base.topics),
    labels: asStringArray(data.labels, base.labels),
    preferLabel: typeof data.preferLabel === "string" ? data.preferLabel : base.preferLabel,
    stars: {
      min: asNumber(stars.min, base.stars.min),
      max: asNumber(stars.max, base.stars.max),
    },
    pushedWithinDays: asNumber(data.pushedWithinDays, base.pushedWithinDays),
    issueUpdatedWithinDays: asNumber(data.issueUpdatedWithinDays, base.issueUpdatedWithinDays),
    excludeUnlicensed: asBoolean(data.excludeUnlicensed, base.excludeUnlicensed),
    excludeArchived: asBoolean(data.excludeArchived, base.excludeArchived),
    pins: asStringArray(data.pins, base.pins),
    denylist: {
      orgs: asStringArray(denylist.orgs, base.denylist.orgs).map((org) => org.toLowerCase()),
      repos: asStringArray(denylist.repos, base.denylist.repos).map((repo) => repo.toLowerCase()),
    },
    dryRun: asBoolean(data.dryRun, base.dryRun),
    caps: {
      maxPrsPerDay: asNumber(caps.maxPrsPerDay, base.caps.maxPrsPerDay),
      maxOpenDraftsPerRepo: asNumber(caps.maxOpenDraftsPerRepo, base.caps.maxOpenDraftsPerRepo),
      maxAttemptsPerIssue: 1,
    },
    statePath: typeof data.statePath === "string" ? data.statePath : base.statePath,
  };
}

export function loadProfile(profilePath = "config/profile.yaml"): Profile {
  const absolute = resolve(profilePath);
  const text = readFileSync(absolute, "utf8");
  return parseProfile(parse(text));
}
