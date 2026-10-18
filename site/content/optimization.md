# Optimizer: review, save and apply

## Run a bounded exact search

Download the [weighted model](../examples/weighted.blueprint.json) as `weighted.blueprint.json` and the policy below as `policy.json`. Its finite three-candidate domain tunes an existing paytable leaf; all other fields remain protected. At stake 1, A has probability 1/4, so multiplier 3 has exact RTP ratio 0.75.

{{example:site/examples/policy.json}}

```sh
pokie optimize weighted.blueprint.json --policy policy.json --format json > review.json
# Read verdict, metrics, diff and identities before either action:
pokie optimize weighted.blueprint.json --policy policy.json --out tuned.blueprint.json --format json
# Or explicitly change authored source after review (mutually exclusive with --out):
pokie optimize weighted.blueprint.json --policy policy.json --apply review.json --format json
```

Keep `review.json` outside a package source tree so it does not change that tree's revision. Publication uses a new/empty destination and preserves the source; authored apply is a separate mutation. It reruns the deterministic request and rejects stale source, policy, candidate or executable dependency identity. Inspect and refresh review after any drift. Saving/applying a best-so-far candidate does not improve its mathematical verdict.

## Policy units, locks and budgets

RTP and hit/feature frequency use ratios, not percentages. Variance uses payout-multiple squared; standard deviation uses payout-multiple. Maximum win requires `currency` or `betMultiple`. Distribution buckets are nonoverlapping half-open `[min,max)` payout multiples; null max means infinity. Tolerances are finite/nonnegative; omitted tolerance means exact binary64 equality. Explicit zero remains zero. Small rounding effects can require an explicit tolerance.

Tunables are existing granted numeric JSON-pointer leaves. Locks protect complete parent values, order and presence. Do not lock an absent field. `fixed`, `sums`, `counts` and `protectedFiles` impose additional constraints. Unknown fields, overlapping tunables/locks and contradictory policies are invalid. Only source-authorized fields can be tuned: a complete model descriptor alone does not grant tuning authority.

`exact-finite-v1` visits the submitted finite Cartesian domain in deterministic order. `budget` counts attempted candidates, including rejected ones; `maxOutcomes` separately caps each exact population. Both are integers from 1 to 1,000,000. Complete supported exclusion is infeasible; stopping at a cap is exhausted, not proof.

## Source-specific authority

| Source | Permitted workflow |
| --- | --- |
| Blueprint | Existing authored paytable leaves, literal or weighted reels, existing bets |
| Canonical lossless PAR | Existing paytable cells with provenance/native readback |
| Declared TypeScript package | Explicit tuning contract, parameter file, model hash and compatible executable enumeration; dependencies stay bound |
| Outcome Library | Positive native numeric weights for the retained outcome population |
| Stake | Positive uint64 decimal-string weights; books/events and tiny positive mass retain native precision |
| Canonical WASM | Explicit reproducible source/tuning binding, feature-free literal source and executable stop-tuple checks |

Advanced stateful populations are unsupported. Exact authored free-game entry analysis only supports `paid-entry`, not the full feature continuation distribution. Native outcomes require `native-outcomes`; that population does not establish the generating game's full-round RTP. [Full policy and authority details](../../docs/optimization.md).

## Seeded search and assessment

`seeded-search-v1` adds bounded search and one held-out assessment with explicit `searchSamples`, `searchBudget`, `assessmentSamples`, `minSamples`, `minEventCount`, `confidence`, `chunkSize` and `workers`. Use positive tolerances for sampled attainment. Seed, worker count, source and dependency bytes determine reproducibility. Entire simultaneous confidence intervals must fit the target tolerance, with minimum paying/nonpaying coverage. A sample maximum is not a hard maximum; sampled volatility/max-win targets are unsupported. Rare/unseen events and zero variance cannot certify attainment. See the [complete seeded policy](../../docs/optimization.md#seeded-search-and-held-out-assessment).

## Verdicts and cancellation

Exact `success` and sampled `attained` exit 0. Operational `failure` exits 1, `infeasible` 2, `invalid` 3, `unsupported` 4, `exhausted` 5, `cancelled` 6 and sampled `inconclusive` 7. Inconclusive means a candidate exists without demonstrated attainment. Candidate presence and a Studio job marked completed do not mean target approval.

Ctrl-C and Studio Cancel request cancellation and wait for owned workers/candidates to drain. Cleanup/release failure is operational failure, not successful cancellation. After restart durable evidence remains, but search cannot resume and save/apply authority is lost. Obtain fresh support and rerun. Studio Overview → **Optimize math** reviews units, locks, budgets, exact/seeded measurements and diff; use separate candidate save or authored apply. Discard unsaved candidates and drain owned work before releasing stores/runtime resources.

## Direct-library ownership

This complete ESM TypeScript function accepts the saved model, validated policy JSON, a new destination and an optional cancellation signal. It uses the same service as CLI/Studio. Calling it with the bounded example yields the same exact verdict; publication is explicit and candidate cleanup runs even if publication fails.

{{example:site/examples/optimize.ts}}
