# 🔐 NPM Authentication Quick Reference

## TL;DR — There's no "choose your path" for the first publish

Trusted Publishing (OIDC) on npmjs.com **can only be configured on a package
that already exists in the registry**. So the first publish of any new package
in this monorepo MUST use an `NPM_TOKEN`. After that publish lands, you can add
GitHub as a Trusted Publisher on each package, then delete the token.

| Phase                                  | Auth              | Why                                              |
| -------------------------------------- | ----------------- | ------------------------------------------------ |
| **First publish (this release)**       | `NPM_TOKEN`       | Trusted Publishing requires existing package     |
| **Ongoing publishes (after v1 lands)** | OIDC (no secrets) | More secure, zero maintenance, npm best-practice |

The `release.yml` workflow supports BOTH modes simultaneously — when
`NPM_TOKEN` is set, it's used; once you delete the secret post-OIDC-setup,
the workflow falls back to id-token automatically. No workflow edits needed
to switch.

---

## Phase 1 — First publish (NPM_TOKEN, required)

### Setup

1. **Create the `@interlace` org on npmjs.com** if it doesn't exist yet.
2. **Generate a Granular Access Token** at https://npmjs.com/settings/~/tokens:
   - Type: _Granular Access Token_
   - Expiration: 30 days (we'll delete it after OIDC is set up anyway)
   - Permissions on packages and scopes: `Read and write`
   - Pattern: `@interlace/*` (or scope-level access to the `@interlace` org)
3. **Add as repo secret:**
   ```bash
   gh secret set NPM_TOKEN --repo ofri-peretz/serverless --body "<token>"
   ```
4. **Confirm packages declare public access:** every `package.json` already has
   `"publishConfig": { "access": "public" }`, so no `--access public` flag is
   needed in CI. (Already verified for all 3 packages in this monorepo.)

### Trigger

Push to `main` (e.g. by merging the v1.0.0 PR). The workflow runs
`changesets/action`, which:

1. Detects unconsumed `.changeset/*.md` files → opens a "version packages" PR
2. (After you merge that PR) → runs `npm publish` for every changed package

The `📦 Published Packages` section in the GHA step summary lists what
landed and at which version.

---

## Phase 2 — Switch to Trusted Publishing (after v1.0.0 is live)

### Setup

For **each** newly-published package on npmjs.com:

1. Visit `https://www.npmjs.com/package/@interlace/<package-name>/access`
2. Under **Trusted Publisher** → Add publisher:
   ```
   Provider:   GitHub Actions
   Repository: ofri-peretz/serverless
   Workflow:   .github/workflows/release.yml
   ```
3. Save.

When all packages have a Trusted Publisher configured:

```bash
gh secret remove NPM_TOKEN --repo ofri-peretz/serverless
```

The next publish run uses OIDC; no other change needed.

---

## What `release.yml` actually wires (so you don't have to take it on faith)

```yaml
permissions:
  id-token: write # ← OIDC (Trusted Publishing)
  contents: write # ← Changesets version-bump commits
  pull-requests: write

env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} # ← used when secret is set
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`actions/setup-node@v4` with `registry-url: https://registry.npmjs.org` writes
an `.npmrc` that uses `${NODE_AUTH_TOKEN}` for auth. When the secret is empty
(post-Phase-2), the value is empty and `npm publish` falls back to OIDC via
`id-token: write`.

---

## Troubleshooting

| Symptom                                      | Cause                                             | Fix                                                                      |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm error code ENEEDAUTH`                   | Secret not set or expired                         | Re-set `NPM_TOKEN` (Phase 1)                                             |
| `403 Forbidden — You do not have permission` | Token scope doesn't cover `@interlace/*`          | Regenerate Granular token with org-level Read+Write                      |
| `403 Forbidden` post-OIDC-setup              | Trusted Publisher not yet added on npm            | Add publisher per Phase 2, OR re-add `NPM_TOKEN` to bridge               |
| `npm error 402 Payment Required`             | Scope missing `publishConfig: { access: public }` | Add it to the package's `package.json` (already in place for all 3 here) |

---

## Resources

- **Granular tokens:** https://docs.npmjs.com/creating-and-viewing-access-tokens
- **Trusted Publishing on npm:** https://docs.npmjs.com/trusted-publishers
- **Detailed setup:** [`.github/TRUSTED_PUBLISHING_SETUP.md`](TRUSTED_PUBLISHING_SETUP.md)
- **Architecture:** [`.github/FINAL_ARCHITECTURE.md`](FINAL_ARCHITECTURE.md)
