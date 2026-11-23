# CLAUDE.md

Map, conventions and tasks: [AGENTS.md](./AGENTS.md). Everything else is a check whose message
names the fix: commit and PR-title scopes (commitlint), skipped hooks and CI polling loops
(`.claude/hooks/guard-bash.mjs`).

- `npm run ci:local` runs the three checks CI runs separately: `ci:format` (prettier, which
  covers md/yml/json too), `ci:oxlint`, `ci:lint` (eslint).
- **`git commit` is the slow one here**: `pre-commit` runs prettier, eslint and tsc and can take
  minutes. `git push` runs typecheck, test and build on the affected packages. Neither is a hang.
