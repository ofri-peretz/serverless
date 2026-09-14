# Commands

- `npm run ci:format` / `ci:oxlint` / `ci:lint` — the three checks CI runs, separately.
  Run all three before pushing; they fail for different reasons and only `ci:lint` is ESLint.
- `npm test` / `npm run typecheck` / `npm run build` — turbo-scoped across the workspace.

# Workflow

- Branch `<type>/<slug>`. Commit `<type>(<scope>): <subject>` — commitlint enforces the scope.
- `git commit` and `git push` run lefthook and can take **3–4 minutes**. That is not a hang.
  If one is killed mid-flight, check `git log origin/<branch> -1` before retrying — a timed-out
  push may still have landed.
- IMPORTANT: never `--no-verify`. The hooks are the gate.
- Waiting on CI? Use `pr-blockers watch`. Never hand-roll `until … gh pr view … sleep` —
  those loops get killed by the harness timeout and end knowing nothing.

# Gotchas

- Prettier (`ci:format`) checks `md`/`yml`/`json` too, so a docs-only change can still fail the
  format gate.
