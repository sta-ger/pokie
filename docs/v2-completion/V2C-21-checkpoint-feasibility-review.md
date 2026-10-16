# Checkpoint feasibility authority: independent packet source review

Reviewed candidate: `3af18d39134ec45ecb8e796119aa94da0e7fb5ce`.
Packet: V2C-21 / `checkpoint-feasibility-authority`.
Reviewer: independent source-review agent `/root/packet_review`.
Verdict: **approved for this bounded packet at source review; no blocking findings**.

This review independently inspected the current committed source and tests. No
commands executing tests, typechecks, builds or controller gates were run by the
reviewer. Test source demonstrates coverage intent; this review does not certify
test execution. The implementation worker owns the required committed-candidate
command evidence. Normal whole-step review and controller gates remain required.

Reviewed production paths:

- `src/wasm/internal/validateCheckpointFeasibility.ts`: positive-weight strip
  envelopes, paid-entry lifetime bounds, bounded active progress, bigint
  partition arithmetic, weighted-bonus duration conservation and reel counts.
- `instantiateDeclarativeWasmRuntime.ts`: native schema validation runs before
  feasibility analysis; feasibility analysis runs before `fromSessionState`.
  Direct restore and replay both enter this validator. Host restoration follows
  successful validation. Rejection therefore precedes native restoration and
  host mutation for the packet's coordinated counter mutations.
- `src/wasm/worker.ts`: restore obtains a successfully restored candidate before
  disposing/replacing the active session; replay delegates to runtime replay.
- Removed accounting methods in `SymbolsCombinationsGenerator.ts`,
  `WeightedBonus.ts` and `BoundedVideoSlotSession.ts`; source/test searches found
  no remaining callers. Node extension restoration retains its native codec
  boundary instead of receiving portable-only feasibility restrictions.
- Authored composition validation, respin transition rules, free-game entry and
  round bookkeeping, purchased free-game entry semantics, weighted-bonus
  execution, weighted selection codec and Hold & Win progression.

| Packet requirement | Source-review evidence |
| --- | --- |
| Derive bounds from portable model, accepted sequence and bounded continuation before native restore | The shared helper constrains mathematical position by delivery sequence and the cascade stage cap, relates current elapsed progress to bounded execution/free-game state, and partitions earlier plays using model-derived entry-length bounds. Weighted bonus durations conserve the exact number of reel entries. Native/public mirror agreement remains an additional consistency check rather than the counter authority. |
| Reject the three saved reductions in direct and Worker restore/replay across delivery policies | `checkpointCounterFixtures` contains the two-play zero-grant reel reduction, seven-play max-two-respin reel reduction and seven-play duration-two bonus reduction. `mutateCheckpointCounters` coordinates native and retained statistics copies. API and Worker tests enumerate plain, stepwise and composite delivery with `maxSubrounds: 1`, assert original counts, and exercise restore/replay rejection on used and fresh receivers. API spies cover native and host restoration; Worker tests retain active serialization and diagnostics after rejection. |
| Preserve valid boundary behavior | Added API cases exercise nontriggering and conditional bonus models, zero duration, zero free-game grants, purchased continuations and nontriggering respins with repeated restore/replay. Counter regressions retain duplicate delivery and forward continuation. Existing named suite source retains failed-command rollback, compact state, sequence-zero initialization, RNG zero, custom-host continuation and Node extension coverage. Sequence-zero initialization remains constructor-validated separately. |
| Avoid replay and a separate payout engine | Strip analysis uses sliding windows and conservative cell envelopes for modifiers/cascades. Arithmetic traverses model definitions, per-outcome counters and the bounded active state. It does not loop over elapsed plays, generate randomness, execute commands or calculate payouts. No checkpoint schema expansion or historical receipt retention was introduced. |
| Independent packet review | This artifact records the independent source review of the exact committed candidate above. |

No false-positive path was identified in the reviewed supported compositions.
Positive-weight alternatives determine reachable envelopes; purchased free games
subtract their first consumed free game from continuation elapsed time; respin
`none` and `reset` use their respective lifetime limits. Conditional bonus
triggers allow entries without selections, and duration-zero outcomes still
conserve selections and completions. Geometry/composition restrictions were
checked at authored validation boundaries where the bounds depend on them.

Review limits: no independent runtime execution was requested or performed.
Controller-owned verification, whole-step approval, integration/publication and
other campaign obligations are outside this packet source-review verdict.
