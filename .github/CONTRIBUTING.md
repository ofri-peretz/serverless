# 📚 Contributing & Release Guide

> **Note:** For general contributor guidance, see the [main `CONTRIBUTING.md`](../CONTRIBUTING.md) at the repo root. This `.github/` copy is for release-related operations specifically.

Welcome! This document is the navigation hub for release and CI/CD operations.

---

## 🚀 Quick navigation

### Releasing code

- **[RELEASE_QUICK_START.md](./RELEASE_QUICK_START.md)** — Day-to-day release flow with Changesets

### Setting up authentication

- **[TRUSTED_PUBLISHING_SETUP.md](./TRUSTED_PUBLISHING_SETUP.md)** — npm OIDC publishing (recommended)
- **[NPM_SETUP_QUICK_REFERENCE.md](./NPM_SETUP_QUICK_REFERENCE.md)** — npm token setup (fallback)

### Configuring the repository

- **[REPOSITORY_SETUP.md](./REPOSITORY_SETUP.md)** — Branch protection, required secrets, topics, descriptions

### Day-to-day GitHub configuration

- **[CODEOWNERS](./CODEOWNERS)** — Auto-review-request mapping
- **[labels.yml](./labels.yml)** — PR/issue label set
- **[dependabot.yml](./dependabot.yml)** — Grouped weekly dependency updates
- **[actionlint.yml](./actionlint.yml)** — GitHub Actions linting config

### Workflows

- **[ci-pr.yml](./workflows/ci-pr.yml)** — Per-PR fast-gate (oxlint, format) + deep-gate (build, test, ESLint, typecheck) across Node 18/20/22/24
- **[lint-pr.yml](./workflows/lint-pr.yml)** — commitlint on PR title
- **[release.yml](./workflows/release.yml)** — Changesets-driven publish on push to `main`
- **[npm-token-health.yml](./workflows/npm-token-health.yml)** — Weekly NPM_TOKEN validity check

### Templates

- **[ISSUE_TEMPLATE/](./ISSUE_TEMPLATE/)** — Bug report + feature request issue forms
- **[PULL_REQUEST_TEMPLATE.md](./PULL_REQUEST_TEMPLATE.md)** — Standard PR description template
- **[SUPPORT.md](./SUPPORT.md)** — Where users go for help

---

## 🤝 Quick contribution loop

```bash
# 1. branch from main
git checkout -b feat/my-change

# 2. write code + tests
# (≥ 90% lines / ≥ 85% branches / 100% functions for any new published-source code)

# 3. add a changeset describing user-visible impact
npx changeset

# 4. lint + test locally
npm run ci:lint
npm test
npm run ci:typecheck

# 5. push + open PR
git push -u origin feat/my-change
gh pr create --fill
```

CI takes ~3 minutes (fast-gate) + ~12 minutes (deep-gate matrix). Merge when both gates are green and a reviewer has approved.
