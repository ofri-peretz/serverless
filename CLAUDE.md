# CLAUDE.md

Map, conventions and tasks: [AGENTS.md](./AGENTS.md). Everything else is a check whose message
names the fix.

- `npm run ci:local` runs the three checks CI runs separately: `ci:format` (prettier, which
  covers md/yml/json too), `ci:oxlint`, `ci:lint` (eslint).
- `pre-commit` runs prettier, eslint and tsc; `pre-push` runs typecheck, test and build on the
  affected packages.
