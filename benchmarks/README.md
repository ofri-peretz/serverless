# @interlace/serverless-benchmarks

Reproducible competitive benchmarks for `@interlace/serverless-*` plugins.

Each suite measures one dimension and produces one comparable score. Methodology is versioned (`v1.0`); changing the corpus, scoring formula, or runner protocol bumps the version so old results stay explicitly comparable.

## Registry

| Suite               | Question                                                                            | Score                        | Status      |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------- | ----------- |
| api-gateway-caching | How does our caching plugin compare to the community alternative on static metrics? | composite (7 weighted dims)  | implemented |
| deploy-latency      | How long does `serverless deploy` take with this plugin vs alternatives?            | seconds (median over N runs) | skeleton    |
| cold-start          | Cold-start latency added by the plugin?                                             | ms (p50 / p95)               | skeleton    |
| feature-coverage    | Of the AWS features users actually use, what fraction does each plugin support?     | coverage %                   | skeleton    |

## Running

```bash
cd benchmarks
npm run bench:caching            # api-gateway-caching
npm run bench:deploy-latency     # deploy-latency (skeleton)
npm run bench:cold-start         # cold-start (skeleton)
npm run bench:feature-coverage   # feature-coverage (skeleton)
```

## Layout

```text
benchmarks/
├── README.md                          # this file
├── package.json                       # @interlace/serverless-benchmarks workspace
├── lib/                               # measure + score helpers (shared)
├── corpus/                            # shared cross-suite fixtures
├── scripts/                           # CI helpers
├── suites/
│   ├── api-gateway-caching/
│   │   ├── competitors.json           # who we compare against
│   │   ├── fixtures/                  # serverless.yml scenarios
│   │   ├── methodology.md             # exact procedure for this suite
│   │   └── run.ts                     # the runner
│   ├── deploy-latency/                # skeleton
│   ├── cold-start/                    # skeleton
│   └── feature-coverage/              # skeleton
└── benchmark-results/
    ├── <suite>/
    │   ├── latest.json                # stable copy for doc imports
    │   └── <YYYY-MM-DD>_v<version>/
    │       └── result.json            # raw measurements + run metadata
    └── scorecard.md                   # cross-suite roll-up (manual for now)
```

## Conventions

- **Single-dimension per suite.** If it measures two things, it's two suites.
- **Single-number top-line score.** Comparable across versions of the same suite.
- **Frozen corpus per version.** Pinned package versions, fixed fixtures.
- **Dated + versioned results.** `<YYYY-MM-DD>_v<version>/` so trends stay readable and methodology changes are explicit.
- **Reproducibility note in each `methodology.md`.** Exact commands, hardware caveats, what's in scope vs out (e.g. cloud-deploy benchmarks declare AWS-credential requirements).

## Adding a new suite

1. Create `suites/<short-name>/` with `competitors.json`, `methodology.md`, `run.ts`.
2. Add the row to the registry table above.
3. Wire `bench:<short-name>` in `package.json` scripts.
4. Start at `v1.0`. Bump the version string in `run.ts` when corpus or scoring changes.
