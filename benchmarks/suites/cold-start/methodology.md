# cold-start — methodology

**Status:** skeleton (v1.0 — not yet implemented)

## Question

What cold-start latency does each candidate plugin add to a Lambda invocation?

## Score

`ms` — `p50` and `p95` of `Init Duration` reported in X-Ray traces, sampled over a fixed number of forced cold starts.

## Procedure (to be filled in)

1. Pin Lambda runtime + memory + region.
2. Force cold starts: redeploy or rotate concurrency to evict the warm container.
3. Sample N invocations (target N ≥ 50 per candidate) with the cold-start fixture.
4. Pull `Init Duration` from X-Ray; compute p50 / p95.

## In scope

- Plugin-attributed init cost (compare against a no-plugin baseline).
- Handler runtime cost (`Duration`) is reported alongside but not in the headline score.

## Out of scope

- Sustained-traffic warm-path performance.
- Region cross-section (run separately per region).

## Reproducibility caveats

- Requires AWS credentials and X-Ray enabled.
- Cold-start measurements are inherently noisy; report both percentiles and sample size.
