[← Back to docs index](README.md)

# Certification evidence dossier

**Certification-ready preparation only.** Integrity verification establishes evidence consistency and
reproduction, not regulatory approval, independent RNG certification, compliance sign-off, authenticity
or guaranteed executable correctness. Independent assessment and controller approval remain separate.

The existing `CertificationEvidenceBundleBuilder`, validator and verifier own this workflow. They reuse
the model reader/extraction, advanced validation, canonical simulation reports, weighted outcome readers
and `AuditRoundReplay`; there is no separate calculation, fairness or replay engine.

## Prepare and reproduce

Keep authored inputs in separate source directories. Create the outcome library through the supported
`pokie build SOURCE --target outcomeLibrary --out NEW_SOURCE` conversion. Build configurations select
modes and explicit evidence authorities; paths below are relative to the configuration file:

```json
{
  "modes": [{"modeName": "base", "seed": "assessment-base", "sampleCount": 100}],
  "dossier": {
    "modelSource": "sources/game-package",
    "reportFiles": ["sources/simulation.json"],
    "replayFiles": ["sources/audit-round.json"],
    "sourceRevision": "reviewed-source-revision",
    "candidateRevision": "reviewed-candidate-revision"
  },
  "output": {
    "formats": ["json", "console", "markdown", "html", "pdf"],
    "templateFile": "sources/presentation.json"
  }
}
```

`dossier`, its individual inputs, and `output` are optional. Every mandatory section still exists;
unavailable model, report, replay, SDK or fairness evidence is explicit. An outcome-only dossier is not
a complete model dossier. Revision labels are retained metadata, never authority in place of byte/model
identities. The selected runtime's config hash must match both the acquired descriptor revision and the
source artifacts. A matching game name/version or an asserted report hash is insufficient.

```sh
pokie certification build sources/outcome-library dossier-config.json --out assessment
pokie certification verify assessment --source relocated/outcome-library --authorities authorities.json --template sources/presentation.json
pokie report assessment/manifest.json --format pdf --out assessment-copy.pdf
pokie report assessment/manifest.json --format html --template presentation.json --out assessment-copy.html
```

`authorities.json` contains the **dossier object**, with explicit relocated model/report/replay paths and
the same revision labels. Its paths are relative to that file. Verification never follows
`manifest.sourceBundleDir`, any retained model location, or attachment locations. Supply every attached
report and replay, in order. Copies can move to a fresh runtime: no cached session, optimization receipt
or original workspace is required. The fresh runtime must provide the same POKIE runtime/dependencies
and unchanged authored source bytes. Changing package bytes (even a comment), evidence, revision or
template invalidates the corresponding identity; regenerate into a new destination.

Library use exposes the same contracts:

```ts
const result = await new CertificationEvidenceBundleBuilder("1.3.0").buildFromBundle(
    sourceBundleDir, modes, newOrEmptyDirectory,
    {dossier: {modelSource, reportFiles, replayFiles}, output: {formats: ["html", "pdf"]}, signal},
);
const issues = await new CertificationEvidenceBundleVerifier().verify(result.outDir, {
    sourceBundleDir: relocatedSource, dossier: relocatedAuthorities, templateFile, signal,
});
const bytes = await new CertificationDossierRenderer().render(result.manifest!, "pdf", undefined, signal);
```

## Canonical contract and integrity

Bundle manifest schema **2** contains dossier schema **1**, presentation template schema **1**, the
original per-mode sample/analysis entries and deep-validation issues. Required closed sections are:

| Section | Contents and boundaries |
| --- | --- |
| identity | Actual model/config hash, raw source-tree identity, source manifest and hash, runtime version, revision labels |
| rules | Authoritative authored/effective symbols, paytable, ordered/weighted reels, bets, modes, win model, mechanics, geometry, field authority, diagnostics and advanced validation |
| statistics | Exact retained-library distributions, generator strategy/coverage, canonical sampled reports, CI/convergence/features, seeds, workers/strategy, populations, stop reasons and explicit unavailable evidence |
| validation | Deep source results at build, declared-model assumptions and executable fidelity; verification is shallow plus independently checked samples |
| reproduction | Native weighted sample selection and separately identified executable audit captures/commands, with partial-capture boundaries |
| support | Invariant preparation-only notice, complete/partial/unavailable **model representation**, limitations and absent scoped SDK/fairness evidence |

Attachments retain raw JSON and its raw-byte SHA-256 alongside the validated parsed value. Model hashes,
library hashes, raw artifact hashes, revision labels and evidence content hashes have different meanings.
The source tree acquisition rejects symlinks and is bounded to 64 MiB / 10,000 files, excluding `.git`
and installed `node_modules`; deployed dependencies/runtime must be supplied separately. Model JSON
acquisition uses the model reader's own budgets. Runtime reports must have canonical schema 1, the matching
runtime/config identity, deterministic seed and worker strategy. Supplied reports are executed again
through `ParallelSimulationRunner` and compared on mathematical/statistical fields. The runtime package
is required for runtime-report/runtime-replay evidence. Native sampled outcome reports instead bind `libraryHash` and mode, reproduce through the existing outcome sampler, and do not invent a config hash; a Blueprint/PAR/WASM definition alone does not grant
arbitrary execution. Unsupported codecs or missing captures remain unavailable/partial.

Compatibility is explicit: launch dossier 1 supports POKIE **1.3.x** producer/artifact runtimes, descriptor
and Blueprint schema 1, canonical simulation report 1, `pokie.audit-round.v1` and
`pokie.session-runtime.v1`. Legacy sample-only manifests, legacy reports and incompatible versions must
be regenerated. Missing/duplicate/unknown sections, malformed metric extensions, missing/extra inventory
entries, symlinked attachments, stale hashes and rehashed model/report/replay substitutions reject.
Hash integrity does not prove authorship or authenticity.

`evidenceContentHash` hashes every semantic manifest field, including dossier attachments and template semantic/raw-byte identities,
except `generatedAt`, `sourceBundleDir` and `deepValidation.ranAt`. Those location/time fields can differ
on rebuild. Supplied raw reports remain exact artifacts: a newly timed simulation file has a different
raw identity even when its mathematics match. Reproduction ignores timing/command location when
comparing simulation mathematics. Rendered files are bound by exact deterministic regeneration from
the canonical manifest, avoiding circular output-file hashes. `result.artifactHashes` reports each
published file's exact-byte SHA-256 separately.

## Metric and template semantics

Formats are `json`, `console`, `markdown`, `html` and an actual locally generated `pdf`. YAML remains
**unimplemented, optional and non-mandatory**. No hosted renderer, browser process, global font or
private service is required. JSON retains canonical evidence; human formats share the same table
projection. Report tables retain separate modes and denominators. Exact distributions describe supplied
library weights; bounded or missing generator provenance does not prove complete model coverage.
RTP/payout multipliers are ratios, probabilities fractions, deviations ratio × 100 percentage points,
monetary amounts currency units, variance squared ratio units and exact maximum win currency units.
Logical-round and accepted-subround populations are distinct. Missing CI/convergence is unavailable,
never zero. Formatting preserves fractional stakes and tiny nonzero probabilities with round-trip
number/scientific notation. There is no invented blended all-mode RTP.

The public [template asset](../templates/certification-dossier.v1.json) documents the complete template
language: a JSON object with exactly `schemaVersion`, nonempty `title`, `introduction` and a permutation
of **all six** mandatory `sections`. Customization changes title (up to 200 characters), introduction (up to 4000 characters) and section order only;
it cannot remove identities, semantics, tables or support disclosures. Unknown fields, missing sections,
duplicate keys, incompatible versions and invalid JSON fail. There is no executable interpolation,
external stylesheet, image include, resource path or network fetch. Resource/include requests are
rejected as unknown fields. HTML and Markdown escape authored text.

PDF 1.4 uses selectable standard Courier text, wrapped two-column evidence tables, page numbers,
repeated section/column context and explicit pagination. Non-ASCII characters use **lossless
`[U+XXXX]` notation** because the self-contained standard font has no universal Unicode glyph coverage;
JSON/HTML retain Unicode text. PDF is intended for printable assessment evidence, not branded artwork.
Independent visual/PDF-reader review is controller-owned and remains separate from source tests.

## Publication, cancellation and Studio

Destinations must be new or physically empty. Existing evidence is never replaceable merely because
`generatedBy` says POKIE. Source/output overlap and symlink aliases reject. All files render and validate
in owned staging first. New directories publish by no-clobber namespace installation; a caller-owned
empty directory keeps its inode and receives owned no-clobber file links with `manifest.json` last as
the commit marker. Readers must require that manifest. A competing entry causes rollback of only this
operation's unchanged files, preserving the foreign entry and caller-owned directory. Authored models,
packages, workbooks, source bundles, reports, replays and templates are not rewritten.

Cancellation propagates through model acquisition, sampling, simulation, rendering and commit. Runtime
leases and owned staging are drained before terminal status. Cleanup errors name the retained owned
path and are actionable failures, not confirmed-cleanup messages. Source drift is rechecked after
rendering, before commit. CLI build handles SIGINT; Studio exposes progress/cancellation through its
existing durable jobs, with captured authorities/template/output request identity and artifact hashes.
Exact active retries reattach; conflicting requests for the same output reject. Restart requires an
honest rebuild. Published results remain preparation-only.

Studio's Certification tab configures model/report/replay/revision/template paths, persists them,
invalidates stale inspection/export on edits, shows model support, and downloads all dossier formats.
The bounded download route validates the retained completed job, source/evidence/template identities,
selected authorities and safe file inventory before returning text or PDF bytes. Changed inputs or
failed builds produce no downloadable successful dossier. Simulation report downloads keep their
existing JSON/Markdown/HTML contracts.

SDK/fairness evidence is currently explicitly **unavailable** in this dossier. No profile is inferred
from a bundle or game name. Existing [SDK diagnostics](external-adapter-sdk.md) establish local target
compatibility, never provider acceptance; existing [HMAC fairness proofs](provably-fair.md) establish
only their versioned deterministic outcome-selection checks, never precommit timing or general game
fairness. These separate contracts must not be presented as certification authority.

### Studio destinations and cancellation

Open the runtime package in Studio and choose **Certification**. Keep that package open:
select its generated outcome-library directory (for example `outcomelibrary`) as the source,
select `modelSource: "."`, and choose an explicit absolute, new or empty output directory
outside that package, for example `/work/evidence/game-dossier`. Certification remains available
when a native outcome library is opened directly, but that directory is not an executable model:
omit the model for visibly unavailable model evidence, or reopen its original package for model-bound
rules. Studio never infers a parent package or substitutes one for the selected model.
Relative outputs remain project-contained. Absolute output selections reject symbolic links in
existing ancestors; all destinations still pass the builder's physical source/output overlap and
ownership checks. Build, retained request identity, retry/recovery and download revalidation resolve
the same destination. Inputs remain project-local and are never copied to enable this workflow.

Deep validation, regenerated dossier validation and native sample verification accept cancellation.
Verification returns an error diagnostic after cancellation and starts no later phase. Studio aborts
and drains download reproduction on disconnect, project close/change and shutdown. Invalid authority
fingerprints are retained as failed certification jobs with correction/rebuild guidance and no downloads.
The shared human-readable rules projection retains every authored/effective field, including paylines,
wild/scatter roles, dimensions and reel-generation inputs. `report --template` is dossier-only, including
when the input resolves to an outcome library or Stake adapter.
