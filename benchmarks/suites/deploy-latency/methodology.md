# deploy-latency — methodology

**Status:** skeleton (v1.0 — not yet implemented)

## Question

How long does `serverless deploy` take with this plugin vs alternatives, on a fixed corpus of representative `serverless.yml` configurations?

## Score

`seconds` — median wall-clock over N runs (target N ≥ 3 after warmup), reported with mean and standard deviation.

## Procedure (to be filled in)

1. Pin the Serverless Framework version and the Node version.
2. For each candidate plugin: install at the pinned version, deploy each fixture, capture wall time.
3. Tear down between runs (CloudFormation stack delete) for cold-state parity.
4. Discard first run as warmup; record runs 2..N.
5. Cleared local cache between timed runs.

## In scope

- Fresh-stack deploy time.
- Update-only deploy time (subsequent runs to a deployed stack).

## Out of scope

- Cold-start latency (covered by `cold-start` suite).
- Feature support (covered by `feature-coverage` suite).

## Reproducibility caveats

- Requires AWS credentials with deploy permissions.
- Region pinned in `competitors.json`.
- Hardware: results vary across machines; CI runs publish on a fixed runner.
