# contrib-agent

An autonomous open-source contributor. It **discovers** GitHub issues from your preferences, **ranks** them, and opens a **draft PR** for the top candidate.

This is not a first-PR teaching site. Use [`code-contributions`](https://github.com/willchrisjr/code-contributions) as an eval target, not as this agent's home.

## What it does

1. Search GitHub for issues matching your languages, labels, and repo health rules.
2. Rank candidates (labels, recency, size, vagueness, star band).
3. Pick the top item that passes policy.
4. Fork, implement, open a **draft** pull request (`Fixes #N`).

`discover --dry-run` prints the list and stops. `run` takes rank #1 and tries a draft PR. Caps keep this from becoming drive-by spam.

## What it will not do

- Open PRs onto someone else's default branch
- Merge anything
- Edit `.github/workflows` on a repo that was only discovered (pins + an explicit issue required)
- Retry an issue or repo that already rejected the agent
- Search the entire internet; it uses the GitHub Issues API only

## Preference profile

Edit [`config/profile.yaml`](config/profile.yaml). You describe what you can work on; the agent searches. There is no hand-picked allowlist.

Maintainer label `contrib-agent` is a **bonus** in ranking, not a requirement.

## CLI

Requires Node.js 24+ and `GITHUB_TOKEN` (or `GH_TOKEN` / `CONTRIB_AGENT_TOKEN`) with `repo` scope.

```bash
npm install
npm test

npx contrib-agent discover --dry-run
npx contrib-agent run --dry-run
npx contrib-agent run
npx contrib-agent run --repo owner/name --issue 123
```

`--fixture evals/fixtures/search-hits.json` ranks recorded hits with no network.

## Eve agent

This repo is an [eve](https://eve.dev) agent. Tools wrap the same library as the CLI. A daily schedule asks the agent to run once under policy.

```bash
export AI_GATEWAY_API_KEY=...   # or link a Vercel project
npm run dev
```

Default model is the Vercel AI Gateway id `anthropic/claude-sonnet-4.5`.

## Autonomy and caps

v1 is **your token + preferences + search**, unattended after ranking:

- Draft PRs only
- 1 new PR per day (configurable)
- 1 open draft per repo
- Never two attempts on the same issue
- Fork, then PR from your fork

v2 can be a GitHub App maintainers install. Until then, denylist huge orgs and keep `dryRun: true` until you trust the ranking.

## Evals

- `npm test` — discovery ranking, policy caps, and the code-contributions card plan against recorded fixtures (no GitHub, no model)
- `npm run eval` — eve session loops (needs `AI_GATEWAY_API_KEY` or a linked Vercel project)

## Schedule

- Eve: [`agent/schedules/daily_run.md`](agent/schedules/daily_run.md) (fires in production `eve start` / Vercel cron, not `eve dev`)
- GitHub Actions: [`.github/workflows/contrib-agent.yml`](.github/workflows/contrib-agent.yml) defaults to `discover --dry-run`

## License

MIT
