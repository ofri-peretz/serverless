# @interlace/serverless-iam-roles-per-function

## 1.0.1

### Patch Changes

- [#47](https://github.com/ofri-peretz/serverless/pull/47) [`402b398`](https://github.com/ofri-peretz/serverless/commit/402b39875af9b2910533bc2fd3f9d1545d5e8e03) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - docs: dual-logo README header (Interlace mark + Serverless mark side by side) and closing Interlace footer — refreshes the README rendered on npmjs.com. No runtime changes.

## 1.0.0

### Major Changes

- [`69e9c53`](https://github.com/ofri-peretz/serverless/commit/69e9c533a31c366f6df13d20947bfd74afcdc2d3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - # v1.0.0 — Initial stable release

  First public stable release of `@interlace/serverless-iam-roles-per-function`.
  Drop-in replacement for the community
  [`serverless-iam-roles-per-function@3.2.0`](https://github.com/functionalone/serverless-iam-roles-per-function)
  plugin (last published 2021-05-21 — five years stale). Existing function-level
  config keys (`iamRoleStatements`, `iamRoleStatementsInherit`,
  `iamRoleStatementsName`, `iamPermissionsBoundary`) work without changes; the
  only required edit is the entry under `plugins:`.

  ## Tested at the same maturity bar as our other `1.0.0` plugins
  - **End-to-end on real AWS** with the `interlace` profile (account
    `346133547796`, IAM user `interlace-cli`). The 12-step suite covers all
    four CLI subcommands (`preview`, `validate`, `audit`, `status`),
    per-function-role deployment via `sls deploy`, CloudFormation stack
    creation, AWS IAM `list-roles` and `get-role-policy` verification of the
    auto-granted SQS statement, live `aws lambda invoke`, full `sls remove`
    teardown, and post-remove verification that no IAM roles are left behind.
    Total run time on `us-east-1`: ~6 minutes; cost: under one cent. See
    [`scripts/e2e/run.ts`](./packages/serverless-iam-roles-per-function/scripts/e2e/run.ts)
    and the dated run logs under
    [`scripts/e2e/runs/`](./packages/serverless-iam-roles-per-function/scripts/e2e/runs/).
  - **TypeScript strict** — all source typechecks under `tsc --noEmit` with
    `strict: true`.
  - **Build clean** — ESM ~23.6 KB / CJS ~18.1 KB, zero runtime dependencies.

  ## What's new vs. the community plugin
  - **Four CLI subcommands the community plugin lacks** — `sls iam preview`
    (dry-run of per-function roles via `pluginManager.spawn('package')`,
    no AWS calls), `sls iam audit` (find functions still on the broad global
    role; supports `--strict` for CI), `sls iam validate` (strict
    statement-grammar check; supports `--strict-wildcard-action`,
    `--strict-wildcard-resource`, `--warnings-as-errors`), and `sls iam status`
    (one-line summary).
  - **Two new auto-permissions** — `events:PutEvents` for `event.eventBridge`
    and `s3:GetObject` for `event.s3` (community covers SQS / streams / DLQ
    only).
  - **`iamRoleStatementsTemplate`** — share base policies across functions by
    name. Define once under `custom.interlaceIamRolesPerFunction.statementTemplates`,
    reference from any function. E2E-verified.
  - **`suppressGlobalRole`** — drop the broad `IamRoleLambdaExecution` fallback
    role entirely when every function has its own role.
  - **`requirePerFunctionRoles`** — fail-fast deploy enforcement; aborts when
    any function lacks an explicit `iamRoleStatements` block (use
    `iamRoleStatements: []` to declare intentional empty intent). E2E-verified
    with `iamRoleStatements: []` on the SQS-event function.
  - **`iamManagedPolicies` per function** — declarative AWS-managed-policy
    attachment. The VPC managed policy auto-attaches when the function has
    VPC config.
  - **Strict statement validation at synth time** — Effect must be `Allow` or
    `Deny`; `Action` and `NotAction` mutually exclusive (same for
    `Resource`/`NotResource`); Action format checked; Sid grammar enforced.
    The community plugin's check is presence-only.
  - **TypeScript config types** — `InterlaceIamConfig`,
    `InterlaceFunctionIamConfig`, and `ValidationFinding` exported for
    `serverless.ts` users.
  - **Zero runtime dependencies** vs the community plugin's `lodash@^4.17.20`.

  ## Compatibility
  - Node.js: `>=20`.
  - Serverless Framework: `^3.0.0 || ^4.0.0` — runtime _and_ types. The plugin's
    default export shape works with both versions' loader (verified via the
    `output.exports: 'default'` build flag).

  ## Drop-in compatibility

  The plugin reads both `custom.interlaceIamRolesPerFunction` (the new canonical
  key) and `custom.serverless-iam-roles-per-function` (the community plugin's
  key) as a backwards-compat alias. So in `serverless.yml`, the only required
  change is the entry under `plugins:`.

  See the [migration guide](https://serverless.interlace.tools/docs/plugins/iam-roles-per-function/migration)
  for the full feature-by-feature comparison and step-by-step swap instructions.
