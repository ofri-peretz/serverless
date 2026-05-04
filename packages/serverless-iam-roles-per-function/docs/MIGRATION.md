# Migrating from `serverless-iam-roles-per-function` (community) to `@interlace/serverless-iam-roles-per-function`

> **Compatibility:** Serverless Framework v3 + v4. Community plugin tested at v3.2.0.

The `@interlace` plugin is config-compatible with the community plugin. **Existing function-level config keys (`iamRoleStatements`, `iamRoleStatementsInherit`, `iamRoleStatementsName`, `iamPermissionsBoundary`) work without changes.** The only required edit is the entry under `plugins:`.

This guide covers:

- [The 5-second migration](#the-5-second-migration)
- [What changes silently for the better](#what-changes-silently-for-the-better)
- [Breaking changes (none, by design)](#breaking-changes-none-by-design)
- [New config opportunities to adopt afterwards](#new-config-opportunities-to-adopt-afterwards)
- [Rollback](#rollback)
- [Verification](#verification)

## The 5-second migration

```diff
 plugins:
-  - serverless-iam-roles-per-function
+  - '@interlace/serverless-iam-roles-per-function'
```

```bash
npm uninstall serverless-iam-roles-per-function
npm install @interlace/serverless-iam-roles-per-function --save-dev
```

That's it. Your existing `iamRoleStatements` and global `defaultInherit` / `iamGlobalPermissionsBoundary` continue to work. The plugin reads both `custom.interlaceIamRolesPerFunction` (new canonical key) and `custom.serverless-iam-roles-per-function` (community key) as a backwards-compat alias.

## What changes silently for the better

These take effect on the first deploy after the swap, with no config edits needed:

1. **EventBridge auto-permission.** Functions with `events: [eventBridge: {eventBus: …}]` get `events:PutEvents` automatically. The community plugin grants nothing here — most users were copy-pasting this into `iamRoleStatements` manually.
2. **S3 event auto-permission.** Functions with `events: [s3: …]` get `s3:GetObject` scoped to `arn:aws:s3:::<bucket>/*`. Same gap as above.
3. **Stricter statement validation at deploy.** The synth-time check fails fast on:
   - Missing/wrong `Effect` (community plugin: only checks presence).
   - `Action` paired with `NotAction`, or `Resource` paired with `NotResource`.
   - Malformed `Sid` (community plugin: no check).
4. **Zero runtime dependencies.** Drops `lodash@^4.17.20` (~70 KB unpacked) from your `node_modules`.
5. **Active maintenance.** Community plugin's last release: 2021-05-21. Anything broken since (Node 22 / Serverless v4 quirks) is now actively fixed.

## Breaking changes (none, by design)

There are no intentional breaking changes for users on community v3.2.0. If you observe a behavior difference, it's a bug — open an issue with a minimal repro at [github.com/ofri-peretz/serverless](https://github.com/ofri-peretz/serverless/issues).

The few **edge cases** to be aware of:

- **Strict validator may flag pre-existing config.** If your `iamRoleStatements` has `Sid: "my-sid"` (hyphen — invalid per AWS) or a malformed `Action` like `s3` (no colon), the synth-time validator will print a warning. Promote to error with `sls iam validate --warnings-as-errors` in CI. The community plugin shipped these to AWS, where they would have been rejected at the IAM API. Now they're caught earlier.
- **Wildcard `*` Action and `*` Resource emit warnings.** Off by default (no failure). Promote to errors with `--strict-wildcard-action` / `--strict-wildcard-resource` if your security policy disallows them.
- **Schema validation (`configValidationMode: error`).** If you're on `configValidationMode: error`, the new `iamRoleStatementsTemplate` and `iamManagedPolicies` properties are recognized; the previously-supported `iamRoleStatements` etc. continue to validate.

## New config opportunities to adopt afterwards

Once the migration is in, you can pick up the new features incrementally:

### Statement templates — share base policies

Define once, reuse anywhere:

```yaml
custom:
  interlaceIamRolesPerFunction:
    statementTemplates:
      data-read:
        - Effect: Allow
          Action: ['dynamodb:GetItem', 'dynamodb:Query']
          Resource:
            Fn::GetAtt: [UsersTable, Arn]

functions:
  listUsers:
    handler: src/handler.list
    iamRoleStatementsTemplate: data-read
    iamRoleStatements: # plus extras
      - Effect: Allow
        Action: ['s3:GetObject']
        Resource: 'arn:aws:s3:::my-bucket/*'
```

### Suppress the broad global role

```yaml
custom:
  interlaceIamRolesPerFunction:
    suppressGlobalRole: true # safe only when EVERY function has iamRoleStatements
```

If you flip this, also flip `requirePerFunctionRoles: true` so the deploy fails fast if a new function is added without statements.

### Fail-fast enforcement

```yaml
custom:
  interlaceIamRolesPerFunction:
    requirePerFunctionRoles: true
```

For functions that legitimately need no permissions, write `iamRoleStatements: []` (explicitly empty). The deploy will then complete because intent was declared.

### Managed policies per function

```yaml
functions:
  apiHandler:
    handler: src/handler.api
    iamRoleStatements:
      - Effect: Allow
        Action: ['dynamodb:GetItem']
        Resource: '*'
    iamManagedPolicies:
      - 'arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess'
      - 'arn:aws:iam::aws:policy/SecretsManagerReadWrite'
```

## Rollback

The migration is fully reversible. To go back to the community plugin:

```diff
 plugins:
-  - '@interlace/serverless-iam-roles-per-function'
+  - serverless-iam-roles-per-function
```

```bash
npm uninstall @interlace/serverless-iam-roles-per-function
npm install serverless-iam-roles-per-function --save-dev
```

Caveats if you'd already adopted the new features:

- `iamRoleStatementsTemplate`, `iamManagedPolicies`, `suppressGlobalRole`, and `requirePerFunctionRoles` will be silently ignored (community plugin doesn't read them — you'll get `additionalProperties: false` schema errors). Remove or comment them out.
- EventBridge / S3 auto-permissions revert to "not granted" — you'll need to add them to `iamRoleStatements` manually.

## Verification

Before merging the migration PR, run the dry-run + audit commands locally:

```bash
# 1. Show every per-function role that the next deploy would create
sls iam preview

# 2. List functions still falling back to the global role (should match old behavior)
sls iam audit

# 3. Validate every iamRoleStatements block — surfaces pre-existing typos
sls iam validate

# 4. Summary
sls iam status
```

For CI gating, add:

```bash
sls iam audit --strict           # exit non-zero on any unguarded function
sls iam validate --warnings-as-errors
```

If you have integration tests that read the synthesized template (e.g. from `sls package`), the per-function role logical IDs are unchanged: `<NormalizedFunctionName>IamRoleLambdaExecution`.

## FAQ

**Q: Does it work with Serverless Framework v4?**
A: Yes. The plugin is built against the v3 + v4 plugin API surface. The official `@serverless/iam-roles-per-function` plugin shipped with v4 is a fork of community v3 — same gaps, same lodash dependency.

**Q: Does it support `provider.iam.role.statements` (v3+) and the deprecated `provider.iamRoleStatements` (v2)?**
A: Both. The settings resolver (`src/settings.ts`) reads from either; `defaultInherit` covers both shapes.

**Q: My function uses `events: [http]` — does the plugin do anything?**
A: No, HTTP events don't need extra IAM. The function just runs the handler. The plugin only auto-grants for event sources where Lambda needs to _pull_ data (SQS, streams) or where Lambda needs to _push_ to AWS (DLQ `onError`, EventBridge `PutEvents`, S3 `GetObject`).

**Q: What if my function has `role: arn:…` (a pre-existing role)?**
A: The plugin throws an error if both `role` and `iamRoleStatements` are set on the same function. They're mutually exclusive. Pick one.

**Q: Will the role logical ID stay stable across the migration?**
A: Yes. Both plugins use `<NormalizedFunctionName>IamRoleLambdaExecution`. CloudFormation will not recreate the role.
