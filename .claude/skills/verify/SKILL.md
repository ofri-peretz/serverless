---
name: verify
description: Run a changed plugin in a scratch service and read the synthesized template, before committing.
---

# Verify a change by running it

Unit tests drive the plugin against a mocked framework; this runs it inside the real one. Paste
the command and what it printed into the commit's `Verified-by:` receipt. Nothing here deploys:
`package` and the plugins' own commands never call AWS.

## Boot

```sh
npx turbo run build --filter=<package>
mkdir -p "$TMPDIR/svc" && cd "$TMPDIR/svc"
npm init -y >/dev/null && npm i -D serverless@3 "<repo>/packages/<package>"
```

Then a `serverless.yml` with `provider: { name: aws, runtime: nodejs20.x }`, one or two functions,
and `plugins: [<package name>]`. Ready means `npx serverless print` exits 0.

## Drive and inspect

Run the command the change is about, then read what it wrote: the printed output, the exit code,
and the CloudFormation template under `.serverless/`. Drive the failing path too: a function
config the plugin must reject, and check the error names the fix.

## Feature map

| Feature                | Reach it by                                                                            | Working means                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Per-function IAM roles | `npx serverless package`, then `.serverless/cloudformation-template-update-stack.json` | one `<Fn>IamRoleLambdaExecution` per function with statements |
| `iam preview`          | `npx serverless iam preview`                                                           | lists the roles a deploy would create                         |
| `iam audit --strict`   | `npx serverless iam audit --strict`                                                    | non-zero when a function lacks statements                     |
| `iam validate`         | `npx serverless iam validate --strict-wildcard-action`                                 | a `*` action fails                                            |
| API Gateway caching    | `npx serverless package` with `custom.apiGatewayCaching`                               | stage and method cache settings in the template               |
| devkit `defineConfig`  | a `serverless.ts` using it, then `npx serverless print`                                | the typed config prints                                       |
| Docs site              | `npm run dev -w @interlace/serverless-docs`, <http://localhost:3001>                   | pages render, no layout break at 390px                        |

## When it fails

Fix the plugin, not this skill. A row that no longer runs is fixed in its own commit. After three
failed rounds, stop and show the person the output.
