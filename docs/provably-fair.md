[← Back to docs index](README.md)

# Provably Fair

`fairness/` implements a commit-reveal Provably Fair proof for a single round drawn from an already-built
[Outcome Library Bundle](outcome-library-bundle.md) — a `FairnessCommitment` published *before* the outcome is
selected, and a `FairnessRoundProof` published *after*, independently verifiable by anyone with the source
bundle, without running any game/win calculation.

Like every other exporter/bundle format in this codebase (`OutcomeLibraryBundleWriter`, `CertificationEvidenceBundleBuilder`),
it never introduces a second calculation path: the deterministic draw a `FairnessRoundProof` records is produced
via the exact same `OutcomeLibraryBundleReading.drawOutcome` every other bundle-backed draw in this codebase
uses — only the byte stream feeding it (HMAC-SHA256 instead of the pre-generated runtime's plain SHA-256 counter
stream) is new.

## Commit-reveal flow

1. **Commit** — before any outcome is selected, the server generates a secret `serverSeed` and calls
   `computeFairnessCommitment({serverSeed, clientSeed, nonce, libraryId, libraryHash, modeName})`. The returned
   `FairnessCommitment` carries only `serverSeedHash` (`sha256:<hex>` of `serverSeed`) — never the seed itself —
   alongside everything else the eventual draw depends on. This is published to the player immediately.
2. **Reveal** — once the round is settled, `FairnessRoundProofBuilder.build(commitment, serverSeed, sourceBundleDir)`
   draws the one outcome this commitment's own `clientSeed`/`nonce`/(now-revealed) `serverSeed` deterministically
   select, and returns a `FairnessRoundProof` carrying the revealed `serverSeed` alongside the drawn
   `outcomeId`/`weight`/`recordHash` and the mode index's own `indexHash`. This is published to the player after
   the round.
3. **Verify** — anyone holding the source bundle (or a copy of it) can independently confirm the proof: does the
   revealed `serverSeed` actually hash to what was committed, does the pinned `libraryHash`/`indexHash` still
   match the live bundle, and does redrawing the same `serverSeed`/`clientSeed`/`nonce` against the live bundle
   select the exact same outcome.

Committing to `serverSeedHash` *before* `clientSeed`/`nonce` are even combined with it is what makes the scheme
meaningful: the deterministic byte stream (see below) is keyed on `serverSeed`, so nobody — including the
server, once committed — can choose a `serverSeed` *after* seeing which one produces a favorable outcome.

## Types

```ts
type FairnessCommitment = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeedHash: string; // sha256:<hex> of the still-secret serverSeed
    clientSeed: string;
    nonce: number;
    libraryId: string;
    libraryHash: string;
    modeName: string;
    issuedAt: string;
};

type FairnessRoundProof = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeed: string;      // revealed
    serverSeedHash: string;  // must match what was committed pre-selection
    clientSeed: string;
    nonce: number;
    libraryId: string;
    libraryHash: string;
    modeName: string;
    indexHash: string;       // computeFairnessIndexHash of the mode index this outcome was drawn from
    outcomeId: string;
    weight: number;
    recordHash: string;      // the drawn outcome's own OutcomeLibraryBundleIndexEntry.recordHash
    revealedAt: string;
};
```

Both are deeply frozen at construction (`computeFairnessCommitment` / `FairnessRoundProofBuilder.build`), the
same "immutable by construction" discipline `WeightedOutcome`/`WeightedOutcomeLibrary` already follow.

## Deterministic byte stream

`algorithmVersion: "pokie-fairness-hmac-sha256-v1"` is currently the only supported algorithm. Block #0/#1/#2/...
of the draw's own byte stream are each `HMAC-SHA256(key=serverSeed, "${clientSeed}:${nonce}:${counter}")`,
concatenated on demand — the same hash-counter DRBG shape `SeededWeightedOutcomeRandomSource` already uses for
pre-generated rounds, HMAC instead of a plain hash specifically so the *whole stream* stays unpredictable without
`serverSeed`, not just resistant to guessing the seed itself. That stream is reduced to an unbiased integer draw
via `drawUnbiasedInt` — the exact same rejection-sampling core every other `WeightedOutcomeRandomSource` in this
codebase shares — so it plugs straight into `OutcomeLibraryBundleReading.drawOutcome` unmodified.

## Building a proof

```ts
import {computeFairnessCommitment, FairnessRoundProofBuilder} from "pokie";

const serverSeed = crypto.randomBytes(32).toString("hex"); // kept secret server-side until reveal
const commitment = computeFairnessCommitment({
    serverSeed,
    clientSeed: "player-supplied-seed",
    nonce: 0,
    libraryId: index.libraryId,
    libraryHash: index.libraryHash,
    modeName: "base",
});
// commitment.serverSeedHash is published to the player now — before the round is played.

const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, "./bundle");
// proof is published to the player after the round settles.
```

`FairnessRoundProofBuilder.build` throws `FairnessRoundProofBuildError` if the revealed `serverSeed` doesn't hash
to the commitment's own `serverSeedHash`, or if the live bundle's mode no longer matches the commitment's own
pinned `libraryId`/`libraryHash`.

## Validation

`FairnessRoundProofValidating.validate(candidate)` checks a proof **by itself** — never needs the source bundle.
Never throws.

| Code | Meaning |
|---|---|
| `fairness-round-proof-malformed` | the candidate doesn't match `FairnessRoundProof`'s own shape (a closed guard — an extra, unexpected field is exactly as invalid as a missing one) |
| `fairness-round-proof-schema-version-unsupported` | `schemaVersion` isn't the current supported version |
| `fairness-round-proof-algorithm-unsupported` | `algorithmVersion` isn't `"pokie-fairness-hmac-sha256-v1"` |
| `fairness-round-proof-server-seed-mismatch` | the revealed `serverSeed` doesn't hash to its own recorded `serverSeedHash` — an invalid or substituted seed |

## Verification

`FairnessRoundProofVerifying.verify(candidate, options)` composes the validator above (a structurally broken or
seed-invalid proof can't be meaningfully cross-checked against anything, so verification short-circuits on those
codes) with a cross-check against the **live** source Outcome Library Bundle.

**`options.sourceBundleDir` is required** to cross-check against a live bundle at all. Without it, `verify()`
runs only the structural self-consistency check above, returns a `fairness-verify-source-bundle-dir-required`
diagnostic, and reads nothing else. Never throws.

| Code | Meaning |
|---|---|
| `fairness-verify-source-bundle-dir-required` | no `sourceBundleDir` was given |
| `fairness-verify-source-bundle-unreadable` | the source bundle's own mode index couldn't be read at `sourceBundleDir` |
| `fairness-verify-library-mismatch` | the live mode's own `libraryId`/`libraryHash` no longer matches this proof's own recorded values — bundle drift |
| `fairness-verify-index-hash-mismatch` | the live mode's own index no longer hashes to this proof's own recorded `indexHash` — bundle drift, at index granularity |
| `fairness-verify-outcome-missing` | the proof's own `outcomeId` is no longer present in the live bundle's mode |
| `fairness-verify-outcome-record-mismatch` | the live index's own entry for `outcomeId` no longer matches this proof's own recorded `weight`/`recordHash` — a substituted outcome |
| `fairness-verify-selection-mismatch` | redrawing this proof's own `serverSeed`/`clientSeed`/`nonce` against the live bundle deterministically selects a **different** outcome id — a forged or substituted proof |
| `fairness-verify-source-bundle-outcome-invariant` | redrawing against the live bundle itself failed (the live bundle's own index/outcomes file have drifted out of sync — see `OutcomeLibraryBundleInvariantError`) |
| `fairness-verify-malformed` | an unexpected error occurred while verifying |

### Two independent checks, not one

A per-id existence/hash check alone can never catch a proof *substituted* with a different, individually valid,
still-existing outcome id — the substituted id is perfectly genuine and untampered, just not the one this
seed/nonce would actually have drawn. Verification therefore checks the drawn outcome two ways: a cheap,
index-only `weight`/`recordHash` comparison against the live index (`fairness-verify-outcome-record-mismatch`),
and a full reproduction of the deterministic draw itself via `OutcomeLibraryBundleReading.drawOutcome`
(`fairness-verify-selection-mismatch`). No game/win calculation is ever involved in either check — only
id/weight/`recordHash` and the byte-range integrity `drawOutcome` already verifies on every read.

## CLI usage

```
pokie fairness verify <proof.json> --source <bundleDir>
```

`--source <bundleDir>` is required — the CLI never falls back to a value embedded in the proof itself (the proof
carries no bundle location at all, by design).

See [CLI](cli.md#pokie-fairness-verify-proofjson---source-bundledir) for full option details.

## Programmatic usage

```ts
import {computeFairnessCommitment, FairnessRoundProofBuilder, FairnessRoundProofVerifier} from "pokie";

const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, "./bundle");
const issues = await new FairnessRoundProofVerifier().verify(proof, {sourceBundleDir: "./bundle"});
// issues is [] when the proof is genuine and the bundle hasn't drifted.
```
