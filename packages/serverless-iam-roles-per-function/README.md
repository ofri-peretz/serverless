# @interlace/serverless-iam-roles-per-function

> Per-function IAM roles for Serverless Framework — strict, typed, observable.

A drop-in replacement for [`serverless-iam-roles-per-function`](https://github.com/functionalone/serverless-iam-roles-per-function) (community v3.2.0, last published 2021-05-21 — **5 years stale**) that keeps the same config keys, adds first-class TypeScript types, four CLI commands, EventBridge + S3 auto-permissions, and strict statement validation.

Supports **Serverless Framework v3 _and_ v4** out of the box — runtime _and_ TypeScript types. The plugin's default export shape works with both versions' loader, and the exported config types (`InterlaceIamConfig`, `InterlaceFunctionIamConfig`, `ValidationFinding`) are usable from `serverless.ts` regardless of framework version.

## Why switch?

Source-backed comparison (community is `serverless-iam-roles-per-function@3.2.0`). Full citations: [`docs/community-plugin-comparison.md`](../../docs/community-plugin-comparison.md).

| Capability                                                        | Community                                                | `@interlace/serverless-iam-roles-per-function`                                |
| ----------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Per-function IAM role generation                                  | ✅                                                       | ✅                                                                            |
| `iamRoleStatements` / `iamRoleStatementsInherit` / `…Name`        | ✅                                                       | ✅ (config keys identical for drop-in)                                        |
| `iamPermissionsBoundary` / `iamGlobalPermissionsBoundary`         | ✅                                                       | ✅                                                                            |
| `defaultInherit`                                                  | ✅                                                       | ✅                                                                            |
| Auto-permissions: SQS / DynamoDB / Kinesis / DLQ (`onError`)      | ✅                                                       | ✅                                                                            |
| **Auto-permissions: EventBridge `event.eventBridge.eventBus`**    | ❌                                                       | ✅ `events:PutEvents`                                                         |
| **Auto-permissions: S3 `event.s3.bucket`**                        | ❌                                                       | ✅ `s3:GetObject` scoped to `arn:aws:s3:::<bucket>/*`                         |
| **`iamManagedPolicies` per function**                             | ❌                                                       | ✅                                                                            |
| **`iamRoleStatementsTemplate` (share base policies)**             | ❌                                                       | ✅ Define once in `custom.…statementTemplates`, reference by name             |
| **`suppressGlobalRole` (drop the broad fallback role)**           | ❌                                                       | ✅ Removes `IamRoleLambdaExecution` when every function has its own role      |
| **`requirePerFunctionRoles` (fail-fast enforcement)**             | ❌                                                       | ✅ Aborts deploy if any function lacks `iamRoleStatements`                    |
| **Strict statement validation (Effect enum, Action format, Sid)** | ⚠️ Presence-only                                         | ✅ Effect must be `Allow`/`Deny`; Action `service:action`; Sid `[A-Za-z0-9]+` |
| **`sls iam preview` (dry-run)**                                   | ❌                                                       | ✅ Lists per-function roles a deploy would create                             |
| **`sls iam audit` (find functions on the global role)**           | ❌                                                       | ✅ Optional `--strict` mode for CI gates                                      |
| **`sls iam validate` (strict statement-grammar check)**           | ❌                                                       | ✅ With `--strict-wildcard-action` / `--strict-wildcard-resource`             |
| **`sls iam status` (summary)**                                    | ❌                                                       | ✅                                                                            |
| **TypeScript types for `serverless.ts` config**                   | ❌ Plugin ships `.d.ts` for the class only — not configs | ✅ `InterlaceFunctionIamConfig` and `InterlaceIamConfig` exported             |
| **Zero runtime dependencies**                                     | ❌ `lodash@^4.17.20`                                     | ✅                                                                            |
| **Active maintenance**                                            | ❌ Last release 2021-05-21 (5 years)                     | ✅ Shipping 2026-05-03                                                        |

## Install

```bash
npm install @interlace/serverless-iam-roles-per-function --save-dev
```

## Quick Start

```yaml
# serverless.yml
plugins:
  - '@interlace/serverless-iam-roles-per-function'

custom:
  interlaceIamRolesPerFunction:
    defaultInherit: false # if true, all functions inherit provider.iam.role.statements
    suppressGlobalRole: true # drop the broad IamRoleLambdaExecution role
    requirePerFunctionRoles: true # fail the deploy if any function is missing iamRoleStatements
    statementTemplates:
      data-read:
        - Effect: Allow
          Action: ['dynamodb:GetItem', 'dynamodb:Query']
          Resource: '*'

functions:
  listUsers:
    handler: src/handler.list
    iamRoleStatementsTemplate: data-read # reuse the named template above
    iamRoleStatements: # plus function-specific statements
      - Effect: Allow
        Action: ['s3:GetObject']
        Resource: 'arn:aws:s3:::my-bucket/*'
```

## Drop-in compatibility

If you're switching from the community plugin, **keep your existing config**. The plugin reads both:

- `custom.interlaceIamRolesPerFunction` — the new canonical key
- `custom.serverless-iam-roles-per-function` — backwards-compat alias for the community key

So the only change in `serverless.yml` is the entry under `plugins:`. See the [Migration Guide](./docs/MIGRATION.md) for details and gotchas.

## TypeScript config (`serverless.ts`)

```ts
import type { Serverless } from 'serverless/aws';
import type {
  InterlaceIamConfig,
  InterlaceFunctionIamConfig,
} from '@interlace/serverless-iam-roles-per-function';

const serverlessConfiguration: Serverless = {
  service: 'my-service',
  plugins: ['@interlace/serverless-iam-roles-per-function'],

  custom: {
    interlaceIamRolesPerFunction: {
      defaultInherit: false,
      suppressGlobalRole: true,
      statementTemplates: {
        'data-read': [
          { Effect: 'Allow', Action: ['dynamodb:GetItem'], Resource: '*' },
        ],
      },
    } satisfies InterlaceIamConfig,
  },

  functions: {
    listUsers: {
      handler: 'src/handler.list',
      iamRoleStatementsTemplate: 'data-read',
      iamRoleStatements: [
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::my-bucket/*',
        },
      ],
    } as { handler: string } & InterlaceFunctionIamConfig,
  },
};

export = serverlessConfiguration;
```

## Auto-permissions

Permissions are derived from the function's `events:` block — you don't have to repeat them in `iamRoleStatements`.

| Event source               | Actions granted                                                                |
| -------------------------- | ------------------------------------------------------------------------------ |
| `events: [sqs: …]`         | `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`            |
| `events: [stream: …]`      | `dynamodb:GetRecords/GetShardIterator/DescribeStream` _or_ `kinesis:` triple   |
| `onError: arn:…sns…`       | `sns:Publish`                                                                  |
| `events: [eventBridge: …]` | `events:PutEvents` _(community plugin: not granted)_                           |
| `events: [s3: …]`          | `s3:GetObject` for `arn:aws:s3:::<bucket>/*` _(community plugin: not granted)_ |

The function's CloudWatch log-group statement is always granted (scoped to the function's own log group, not `*`).

## Statement templates

Define a base policy once and reference it from any function:

```yaml
custom:
  interlaceIamRolesPerFunction:
    statementTemplates:
      data-read:
        - Effect: Allow
          Action: ['dynamodb:GetItem', 'dynamodb:Query']
          Resource:
            Fn::GetAtt: [UsersTable, Arn]
      cache-write:
        - Effect: Allow
          Action: ['elasticache:DescribeCacheClusters']
          Resource: '*'

functions:
  listUsers:
    handler: src/handler.list
    iamRoleStatementsTemplate: data-read # reused from the template
```

Functions can still add their own `iamRoleStatements:` array — the resolved statement list is `[log, auto-perms, inherited?, template, function-specific]`.

## CLI commands

```bash
# Dry-run: list the per-function roles a deploy would create
sls iam preview

# Audit: list functions falling back to the global role
sls iam audit
sls iam audit --strict     # exit non-zero if any function lacks iamRoleStatements

# Validate every iamRoleStatements block against the strict grammar
sls iam validate
sls iam validate --strict-wildcard-action
sls iam validate --strict-wildcard-resource
sls iam validate --warnings-as-errors

# Summary: how many functions have per-function roles
sls iam status
```

`iam preview` works without an AWS account — it clones the compiled CloudFormation template, runs the role-builder, then restores the original.

## Configuration reference

### `custom.interlaceIamRolesPerFunction`

| Key                            | Type                                   | Default | Description                                                                                                                                            |
| ------------------------------ | -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defaultInherit`               | `boolean`                              | `false` | If `true`, every function with `iamRoleStatements` also includes `provider.iam.role.statements`. Per-function override via `iamRoleStatementsInherit`. |
| `iamGlobalPermissionsBoundary` | `string \| Fn::Sub \| Fn::ImportValue` | —       | Permissions boundary applied to the global role _and_ any per-function role that doesn't set its own.                                                  |
| `suppressGlobalRole`           | `boolean`                              | `false` | Remove the broad `IamRoleLambdaExecution` role from the template — only safe when **every** function has its own role.                                 |
| `requirePerFunctionRoles`      | `boolean`                              | `false` | Fail the deploy if any function is missing `iamRoleStatements`. Set `iamRoleStatements: []` on intentionally-empty functions.                          |
| `statementTemplates`           | `Record<string, IamStatement[]>`       | `{}`    | Named base policies referenced by `iamRoleStatementsTemplate`.                                                                                         |

### Per-function (under `functions.<name>`)

| Key                         | Type                                   | Description                                                                                                                             |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `iamRoleStatements`         | `IamStatement[]`                       | Per-function policy statements. Triggers per-function role creation.                                                                    |
| `iamRoleStatementsInherit`  | `boolean`                              | Override `defaultInherit` for this function.                                                                                            |
| `iamRoleStatementsName`     | `string`                               | Custom role name (max 64 chars; will be truncated by stripping the `Lambda` suffix if needed).                                          |
| `iamRoleStatementsTemplate` | `string`                               | Name of a template defined under `custom.…statementTemplates`.                                                                          |
| `iamPermissionsBoundary`    | `string \| Fn::Sub \| Fn::ImportValue` | Permissions boundary for this function's role only.                                                                                     |
| `iamManagedPolicies`        | `string[]`                             | List of managed-policy ARNs to attach to the function's role. AWS-managed VPC policy is auto-attached when the function has VPC config. |

## How it works

1. **`before:package:finalize`** — runs after Serverless compiles the CloudFormation template.
2. For each function with `iamRoleStatements`, clone the global role into a new resource named `<NormalizedFunctionName>IamRoleLambdaExecution`.
3. Replace its `Policies[0].PolicyDocument.Statement` with `[log, auto-perms, inherited?, template, function-specific]`.
4. Update the `AWS::Lambda::Function` resource's `Role.Fn::GetAtt[0]` and `DependsOn` to point at the new role.
5. Update any `AWS::Lambda::EventSourceMapping` resources to depend on the new role.
6. If `suppressGlobalRole: true` and every function has its own role, delete the `IamRoleLambdaExecution` resource.

The plugin runs entirely at synth time. Nothing is invoked at deploy or runtime.

## Validation rules

The strict statement validator (`sls iam validate`) catches what the community plugin's presence-only check misses:

- `Effect` must be exactly `"Allow"` or `"Deny"` (community plugin only checks for non-empty).
- `Action` and `NotAction` are mutually exclusive (`Resource` and `NotResource` likewise).
- `Action` strings should match `service:action` (warning) or `*` (warning by default; promote with `--strict-wildcard-action`).
- `Sid` must match `^[A-Za-z0-9]+$` per the AWS spec.
- Wildcard `Resource` is a warning by default (some services legitimately need it; promote with `--strict-wildcard-resource`).

## Documentation

- [Migration guide (community → @interlace)](./docs/MIGRATION.md)
- [Source-backed comparison](../../docs/community-plugin-comparison.md)
- [Architecture](./docs/ARCHITECTURE.md)

## License

MIT — © Ofri Peretz
