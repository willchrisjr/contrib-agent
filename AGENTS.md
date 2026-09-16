# contrib-agent

Discover GitHub issues from `config/profile.yaml`, rank them, and open draft PRs. CLI: `npx contrib-agent discover --dry-run`. Shared library lives in `agent/lib/`; eve tools in `agent/tools/` wrap it. Keep `dryRun: true` until ranking is trusted. Run `npm test` after scoring or policy changes.

# eve Agent App

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`.
