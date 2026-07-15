[← Back to docs index](README.md)

# Provably Fair

`fairness/` implements a commit-reveal Provably Fair proof for a single round drawn from an already-built
[Outcome Library Bundle](outcome-library-bundle.md) — a `FairnessServerSeedCommitment` published *before*
`clientSeed`/`nonce` are even known, a `FairnessCommitment` published *before* the outcome is selected, and a
`FairnessRoundProof` published *after*, independently verifiable by anyone with the source bundle and the
original commitment, without running any game/win calculation.

Like every other exporter/bundle format in this codebase (`OutcomeLibraryBundleWriter`, `CertificationEvidenceBundleBuilder`),
it never introduces a second calculation path: the deterministic draw a `FairnessRoundProof` records is produced
via one pinned snapshot of a mode's own index (`selectIndexEntryByCumulativeWeight` +
`readAndVerifyOutcomeAtByteRange`, never `OutcomeLibraryBundleReading.drawOutcome` itself — see "Pinned-snapshot
drawing" below), the exact same algorithms `OutcomeLibraryBundleReader` and `CertificationEvidenceBundleBuilder`
already use — only the byte stream feeding the selection (HMAC-SHA256 instead of the pre-generated runtime's
plain SHA-256 counter stream) is new.

## Three artifacts, not two

An earlier version of this slice published one `FairnessCommitment` carrying both `serverSeedHash` and
`clientSeed`/`nonce` together — but a single object built from one function call taking both a raw `serverSeed`
and `clientSeed` at once cannot, by construction, prove the server didn't wait to see `clientSeed` before
choosing `serverSeed`. That guarantee needs two separate, sequential artifacts:

1. **`FairnessServerSeedCommitment`** — published immediately, before `clientSeed`/`nonce` are even solicited.
   Carries *only* `serverSeedHash`; structurally cannot mention `clientSeed`/`nonce`/library/mode at all.
2. **`FairnessCommitment`** (the "round commitment") — published once `clientSeed`/`nonce` are known and *before*
   the outcome is selected. `computeFairnessCommitment` always takes a `FairnessServerSeedCommitment` as an
   input, copying its `serverSeedHash`/`algorithmVersion` forward unchanged — never a raw `serverSeed` — so a
   round commitment can only ever carry forward a hash that was already, separately published.
3. **`FairnessRoundProof`** — the reveal, published after the round settles.

This library cannot itself prove *when* step 1 was published relative to step 2 — that needs an external
commitment log or timestamping authority, out of scope here. What the type split provides is the structural
shape that makes publishing the server-seed commitment first the only way to use the API at all, rather than an
unenforced convention a single, more permissive function signature could quietly be used to skip.

## Commit-reveal flow

1. **Server-seed commit** — the server generates a secret `serverSeed` and calls
   `computeFairnessServerSeedCommitment({serverSeed})`. The returned `FairnessServerSeedCommitment` (just
   `serverSeedHash` + algorithm/schema stamps) is published to the player immediately.
2. **Round commit** — once the player's `clientSeed`/`nonce` are known, the server calls
   `computeFairnessCommitment({serverSeedCommitment, clientSeed, nonce, libraryId, libraryHash, modeName})`. The
   returned `FairnessCommitment` is published to the player before the round is played.
3. **Reveal** — once the round is settled, `FairnessRoundProofBuilder.build(commitment, serverSeed, sourceBundleDir)`
   draws the one outcome this commitment's own `clientSeed`/`nonce`/(now-revealed) `serverSeed` deterministically
   select, and returns a `FairnessRoundProof` carrying the revealed `serverSeed`, the drawn
   `outcomeId`/`weight`/`recordHash`, the mode index's own `indexHash`, and a `commitmentHash` binding this exact
   proof to the exact commitment it was built from. Published to the player after the round.
4. **Verify** — anyone holding the source bundle and the original `FairnessCommitment` can independently confirm
   the proof: is it genuinely bound to that commitment (`commitmentHash` plus an exact field-by-field match), does
   the revealed `serverSeed` actually hash to what was committed, does the pinned `libraryHash`/`indexHash` still
   match the live bundle, and does redrawing the same `serverSeed`/`clientSeed`/`nonce` against the live bundle
   select the exact same outcome.

## Types

```ts
type FairnessServerSeedCommitment = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeedHash: string; // sha256:<hex> of the still-secret serverSeed
    issuedAt: string;
};

type FairnessCommitment = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeedHash: string; // carried forward unchanged from a FairnessServerSeedCommitment
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
    commitmentHash: string;  // computeFairnessCommitmentHash of the exact FairnessCommitment this round was built from
    revealedAt: string;
};
```

All three are deeply frozen at construction, the same "immutable by construction" discipline
`WeightedOutcome`/`WeightedOutcomeLibrary` already follow.

## Canonical hashing

`computeFairnessCommitmentHash(commitment)` and `computeFairnessRoundProofHash(proof)` both hash via
`toCanonicalJson` + the shared `sha256:<hex>` convention — the same pattern `computeWeightedOutcomeLibraryHash`
uses, stable regardless of the source object's own key order. `computeFairnessCommitmentHash` is the one used
internally (by `FairnessRoundProofBuilder` to set `commitmentHash`, and by `FairnessRoundProofVerifying` to
recompute and compare it); `computeFairnessRoundProofHash` is a general-purpose content identity for a whole
proof (deduplication, storage keys), never used to re-derive any of the fields it hashes over.

## Deterministic byte stream

`algorithmVersion: "pokie-fairness-hmac-sha256-v1"` is currently the only supported algorithm. Block #0/#1/#2/...
of the draw's own byte stream are each `HMAC-SHA256(key=serverSeed, "${clientSeed}:${nonce}:${counter}")`,
concatenated on demand — the same hash-counter DRBG shape `SeededWeightedOutcomeRandomSource` already uses for
pre-generated rounds, HMAC instead of a plain hash specifically so the *whole stream* stays unpredictable without
`serverSeed`, not just resistant to guessing the seed itself. That stream is reduced to an unbiased integer draw
via `drawUnbiasedInt` — the exact same rejection-sampling core every other `WeightedOutcomeRandomSource` in this
codebase shares.

## Pinned-snapshot drawing

Both `FairnessRoundProofBuilder` and `FairnessRoundProofVerifier` draw through the same internal
`drawPinnedFairnessOutcome` helper — never `OutcomeLibraryBundleReading.drawOutcome` itself, which re-reads a
fresh index on every call and could therefore observe a genuinely different index between selecting an entry and
reading it. `modeName` (and, through it, the index/outcomes file this eventually reads) is never trusted blindly:
it comes straight off an untrusted `FairnessCommitment`/`FairnessRoundProof`, and every step below is guarded
accordingly.

0. `modeName` is checked against this bundle format's own canonical rule (`[A-Za-z0-9_-]+`) **before any file is
   read at all**. `FairnessCommitmentValidating`/`FairnessRoundProofValidating` already enforce this same rule, so
   in practice this is a redundant, defense-in-depth check — but it's what makes `drawPinnedFairnessOutcome`
   itself provably safe regardless of what validated it first.
1. a mode's own index is read exactly **once** and validated via an internal `validatePinnedFairnessModeIndex`
   check — never trusted blindly: `OutcomeLibraryBundleReader.readModeIndex` itself does no runtime shape
   checking at all (a raw `JSON.parse` + type-cast), so a malformed or hand-tampered `index_<modeName>.json`
   would otherwise be trusted as-is. This check mirrors the relevant parts of
   [`OutcomeLibraryBundleValidator`](outcome-library-bundle.md)'s own per-mode checks — closed shape at both the
   index and the per-entry level (every entry must be *exactly* `{id, weight, byteOffset, byteLength,
   recordHash}`, no more, no fewer), current schema/library-schema versions, `index.modeName` matching the mode
   actually requested, `index.outcomesFile` matching `outcomes_<modeName>.jsonl` **exactly** (not just "a
   safe-looking string"), positive safe `outcomeCount`/`totalWeight`/entry weights, canonically sorted and unique
   entry ids, and a canonical byte layout across all entries — the first entry's `byteOffset` is exactly `0`, and
   every later entry's `byteOffset` is exactly the previous entry's own `byteOffset + byteLength + 1` (the `+1`
   accounts for the trailing `"\n"` every record is written with — see `streamModeOutcomesToTempFile`'s own
   `offset += lineBuffer.byteLength + 1`), so ranges can never overlap or leave a gap, and `byteOffset +
   byteLength` is checked to never overflow a safe integer either — then the validated index is held in memory;
2. a winning entry is selected against that captured index via `selectIndexEntryByCumulativeWeight` (the exact
   cumulative-weight walk `OutcomeLibraryBundleReader.drawOutcome` uses internally);
3. that exact entry's own byte range is read and verified via `readAndVerifyOutcomeAtByteRange`, against a path
   resolved via `resolveSafeStakeEngineFilePath` — **never a plain `path.join` of `index.outcomesFile`**. Step 1
   already pins `outcomesFile` to one exact, self-constructed filename, but resolving it through the same
   safe-path helper every other bundle-reading class in this codebase uses is a second, independent guard against
   ever opening a path outside `sourceBundleDir`;
4. the mode's own index is read a **second** time and re-hashed (`computeFairnessIndexHash` — the whole object,
   not just `libraryHash`, which a hand-tampered index could leave stale while its entries were rewritten
   underneath it) — any difference from the first hash throws/reports bundle drift, and nothing is
   built/verified from a snapshot caught changing mid-draw.

This is the same "Pinned-snapshot sampling" + "Snapshot consistency" discipline
[`CertificationEvidenceBundleBuilder`](certification-evidence-bundle.md#pinned-snapshot-sampling) already
follows, just for one single outcome rather than a whole sampled sequence, and checked synchronously around one
draw rather than deferred to just-before-publish. A bundle that briefly changes and is then restored to its exact
original bytes *before* a build/verify call ever runs leaves that call entirely unaffected — only drift observed
*during* the pinned draw itself (or between building a proof and later verifying it, at the whole-bundle level)
is caught.

## Building a proof

```ts
import {computeFairnessCommitment, computeFairnessServerSeedCommitment, FairnessRoundProofBuilder} from "pokie";

const serverSeed = crypto.randomBytes(32).toString("hex"); // kept secret server-side until reveal
const serverSeedCommitment = computeFairnessServerSeedCommitment({serverSeed});
// serverSeedCommitment.serverSeedHash is published to the player now — before clientSeed/nonce are solicited.

const commitment = computeFairnessCommitment({
    serverSeedCommitment,
    clientSeed: "player-supplied-seed",
    nonce: 0,
    libraryId: index.libraryId,
    libraryHash: index.libraryHash,
    modeName: "base",
});
// commitment is published to the player now — before the round is played.

const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, "./bundle");
// proof is published to the player after the round settles.
```

`FairnessRoundProofBuilder.build` always validates the given commitment via `FairnessCommitmentValidating` first
(never builds against a malformed commitment), and throws `FairnessRoundProofBuildError` if: the commitment
doesn't validate, the revealed `serverSeed` doesn't hash to the commitment's own `serverSeedHash`, the live mode
index doesn't validate on its own (see "Pinned-snapshot drawing" above), the live bundle's mode no longer matches
the commitment's own pinned `libraryId`/`libraryHash`, or the pinned draw itself detects bundle drift.

`computeFairnessCommitment`/`computeFairnessServerSeedCommitment` both reject an invalid custom `issuedAt`
immediately (a `RangeError`, no bundle ever touched) rather than silently returning an artifact that looks
successfully built but fails its own validator the moment anyone checks it.

### Mandatory vs. additive validation

`FairnessRoundProofBuilder`/`FairnessRoundProofVerifier` both always run their own mandatory validators
(`FairnessCommitmentValidator`, and for the verifier `FairnessRoundProofValidator` too) — hardcoded internally,
**not** swappable via constructor injection, so a caller can never accidentally (or maliciously) bypass them by
supplying a permissive replacement. Each constructor's trailing `additionalCommitmentValidator`/
`additionalProofValidator` parameters are the one caller-extensible hook: a custom check layered **on top of**
the mandatory one, whose issues are always merged in alongside it. An `additionalCommitmentValidator` that always
returns `[]` can never suppress a mandatory issue — it can only ever fail to add more of its own.

## Server-seed commitment validation

`FairnessServerSeedCommitmentValidating.validate(candidate)` checks a `FairnessServerSeedCommitment` **by
itself** — closed shape (a smuggled-in `clientSeed`/`nonce`/library/mode field is exactly as invalid as a missing
required one — this is the check that keeps the "published before `clientSeed`/`nonce`" type split in "Three
artifacts, not two" meaningful, not just cosmetic), current schema/algorithm versions, a valid `sha256:<hex>`
`serverSeedHash`, and a strictly canonical ISO timestamp. `computeFairnessCommitment` always runs this validator
against its own `serverSeedCommitment` input — never an ad-hoc, separately-maintained field check that could
silently drift from what this validator actually enforces. Never throws.

| Code | Meaning |
|---|---|
| `fairness-server-seed-commitment-malformed` | the candidate doesn't match `FairnessServerSeedCommitment`'s own shape |
| `fairness-server-seed-commitment-schema-version-unsupported` | `schemaVersion` isn't the current supported version |
| `fairness-server-seed-commitment-algorithm-unsupported` | `algorithmVersion` isn't `"pokie-fairness-hmac-sha256-v1"` |

## Commitment validation

`FairnessCommitmentValidating.validate(candidate)` checks a commitment **by itself** — closed shape (an extra,
unexpected field is exactly as invalid as a missing one), current schema/algorithm versions, valid `sha256:<hex>`
hashes, non-empty `clientSeed`/`libraryId`, a `modeName` matching this bundle format's own canonical rule
(`[A-Za-z0-9_-]+` — the same rule `OutcomeLibraryBundleValidator`/`CertificationEvidenceBundleValidator` enforce;
`modeName` ends up embedded in a filename the moment a draw is attempted, so anything else is rejected here,
before it ever could be), a non-negative safe `nonce`, and a strictly canonical ISO timestamp. Used both by
`FairnessRoundProofBuilder` (always, before building) and `FairnessRoundProofVerifying` (always, before trusting
a caller-given commitment for any cross-check) — the same commitment can never be judged well-formed by one and
malformed by the other. Never throws.

| Code | Meaning |
|---|---|
| `fairness-commitment-malformed` | the candidate doesn't match `FairnessCommitment`'s own shape (including an invalid `modeName`) |
| `fairness-commitment-schema-version-unsupported` | `schemaVersion` isn't the current supported version |
| `fairness-commitment-algorithm-unsupported` | `algorithmVersion` isn't `"pokie-fairness-hmac-sha256-v1"` |

## Proof validation

`FairnessRoundProofValidating.validate(candidate)` checks a proof **by itself** — never needs the source bundle
or the original commitment.

| Code | Meaning |
|---|---|
| `fairness-round-proof-malformed` | the candidate doesn't match `FairnessRoundProof`'s own shape (closed) |
| `fairness-round-proof-schema-version-unsupported` | `schemaVersion` isn't the current supported version |
| `fairness-round-proof-algorithm-unsupported` | `algorithmVersion` isn't `"pokie-fairness-hmac-sha256-v1"` |
| `fairness-round-proof-server-seed-mismatch` | the revealed `serverSeed` doesn't hash to its own recorded `serverSeedHash` — an invalid or substituted seed |

## Verification

`FairnessRoundProofVerifying.verify(candidate, options)` composes the proof validator above (a structurally
broken or seed-invalid proof can't be meaningfully cross-checked against anything, so verification short-circuits
on those codes) with two cross-checks: against the original commitment, and against the *live* source Outcome
Library Bundle.

**`options.commitment` is required** — without it, full verification is impossible: a proof's own internal
consistency alone can never prove it was genuinely bound to a previously-issued commitment rather than built
around a fresh, self-consistent, but entirely unrelated `serverSeed`/`clientSeed`/`nonce`. Checked before
`sourceBundleDir`, and before anything reads a bundle at all.

**`options.sourceBundleDir` is required** to cross-check against a live bundle at all. Without it (but with a
valid commitment), `verify()` runs the structural + commitment checks and reads no bundle.

```
pokie fairness verify proof.json --commitment commitment.json --source bundle
```

| Code | Meaning |
|---|---|
| `fairness-verify-commitment-required` | no commitment was given |
| `fairness-verify-commitment-invalid` | the given commitment does not itself validate (see Commitment validation above) |
| `fairness-verify-commitment-hash-mismatch` | this proof's own `commitmentHash` doesn't match the given commitment — it was not built from this exact commitment |
| `fairness-verify-commitment-mismatch` | one or more of `algorithmVersion`/`serverSeedHash`/`clientSeed`/`nonce`/`libraryId`/`libraryHash`/`modeName` differ between the proof and the given commitment |
| `fairness-verify-source-bundle-dir-required` | no `sourceBundleDir` was given |
| `fairness-verify-source-bundle-unreadable` | the source bundle's own mode index couldn't be read at `sourceBundleDir` |
| `fairness-verify-bundle-drift` | the mode's own index changed between the pinned draw's first read and its post-draw re-verification |
| `fairness-verify-mode-index-invalid` | the live mode's own index doesn't validate on its own (closed shape, schema/library-schema version, expected `modeName`, exact `outcomes_<modeName>.jsonl`, positive safe counts/weights, canonical entries) |
| `fairness-verify-library-mismatch` | the live mode's own `libraryId`/`libraryHash` no longer matches this proof's own recorded values |
| `fairness-verify-index-hash-mismatch` | the live mode's own index no longer hashes to this proof's own recorded `indexHash` |
| `fairness-verify-outcome-missing` | the proof's own `outcomeId` is no longer present in the live bundle's mode |
| `fairness-verify-outcome-record-mismatch` | the live index's own entry for `outcomeId` no longer matches this proof's own recorded `weight`/`recordHash` — a substituted outcome |
| `fairness-verify-selection-mismatch` | redrawing this proof's own `serverSeed`/`clientSeed`/`nonce` against the live bundle deterministically selects a **different** outcome id — a forged or substituted proof |
| `fairness-verify-source-bundle-outcome-invariant` | the pinned draw's own selection/byte-range read failed against the live bundle |
| `fairness-verify-malformed` | an unexpected error occurred while verifying |

### Three independent checks, not one

A proof passing its own self-consistency check (`FairnessRoundProofValidating`) proves only that *someone* knew
how to pair a `serverSeed` with its own hash — trivial for anyone, including an attacker minting an entirely
fresh `serverSeed`/`clientSeed`/`nonce` and drawing a real, self-consistent outcome from the same public bundle.
Verification therefore layers three genuinely independent checks, each catching something the others can't:

- **Commitment binding** (`commitmentHash` + field-by-field match): catches a proof never actually built from the
  genuine commitment at all, however internally self-consistent it is on its own.
- **Live record check** (index-only `weight`/`recordHash` comparison): catches a substituted-but-individually-
  valid outcome id whose content was tampered.
- **Selection reproduction** (the full pinned redraw): catches a substituted outcome id whose content is
  completely genuine and untampered elsewhere in the library — the id is simply not the one this seed/nonce would
  actually have drawn.

No game/win calculation is ever involved in any of the three — only id/weight/`recordHash` and the byte-range
integrity the pinned draw already verifies on its own single read.

## CLI usage

```
pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>
```

Both `--commitment <commitment.json>` and `--source <bundleDir>` are required — the CLI never falls back to a
value embedded in the proof itself (a `FairnessRoundProof` carries no bundle location or original commitment of
its own, by design).

See [CLI](cli.md#pokie-fairness-verify-proofjson---commitment-commitmentjson---source-bundledir) for full option
details.

## Programmatic usage

```ts
import {computeFairnessCommitment, computeFairnessServerSeedCommitment, FairnessRoundProofBuilder, FairnessRoundProofVerifier} from "pokie";

const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, "./bundle");
const issues = await new FairnessRoundProofVerifier().verify(proof, {commitment, sourceBundleDir: "./bundle"});
// issues is [] when the proof is genuine, bound to the given commitment, and the bundle hasn't drifted.
```
