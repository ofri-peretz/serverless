# feature-coverage — methodology

**Status:** skeleton (v1.0 — not yet implemented)

## Question

Of the AWS features users actually configure (sourced from a fixed list pinned per methodology version), what fraction does each candidate plugin support?

## Score

`coverage %` — `(features supported) / (features in pinned list)` per plugin.

## Procedure (to be filled in)

1. Maintain a pinned feature list in `corpus/feature-coverage-v1.0.json`.
2. For each candidate plugin: derive support from public docs + source inspection (no AWS calls required).
3. Mark each feature `supported | partial | unsupported` with a citation.
4. Score = supported / total. Partial counts as 0.5.

## In scope

- Static feature support (configurable surface).
- Documentation-claimed support cross-checked against source.

## Out of scope

- Runtime correctness (covered by other suites or per-plugin tests).
- Performance per feature.

## Reproducibility caveats

- Bumping the feature list bumps the methodology version (e.g. `v1.0` → `v1.1`).
- Citations must include a permanent link (file + commit SHA, or doc URL with archive snapshot).
