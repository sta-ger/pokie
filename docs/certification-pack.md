[← Back to docs index](README.md)

# Certification pack

**Preparation only.** Verification shows that the pack is internally consistent and reproducible. It
does not prove regulatory approval, independent RNG certification, compliance sign-off, authenticity or
that the game executable is correct. Independent assessment remains separate.

`CertificationPackBuilder`, `CertificationPackValidator` and `CertificationPackVerifier` own this
workflow. They reuse the model reader, advanced validation, simulation reports, outcome library readers
and `AuditRoundReplay`; there is no separate calculation, fairness or replay engine.

## Prepare and reproduce

Keep the inputs in separate source folders. Create the outcome library through the supported conversion:

```sh
pokie build SOURCE --target outcomeLibrary --out NEW_SOURCE
```

Build configurations select modes and explicit trusted sources. Paths below are relative to the
configuration file:

```json
{
 "modes": [{"modeName": "base", "seed": "assessment-base", "sampleCount": 100}],
 "pack": {
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

`pack`, its individual inputs and `output` are optional. Every mandatory section still exists;
unavailable model, report, replay, SDK or fairness evidence is explicit. An outcome-only pack is not a
complete model pack. Revision labels are saved metadata, never a replacement for byte or model
identities. The selected runtime's config hash must match both the acquired descriptor revision and the
source files. A matching game name/version or an asserted report hash is not enough.

```sh
pokie certification build sources/outcome-library pack-config.json --out assessment
pokie certification verify assessment --source relocated/outcome-library --trusted-sources sources.json --template sources/presentation.json
pokie report assessment/manifest.json --format pdf --out assessment-copy.pdf
pokie report assessment/manifest.json --format html --template presentation.json --out assessment-copy.html
```

The trusted-sources file contains the **pack object**, with explicit relocated model, report and replay
paths and the same revision labels. Its paths are relative to that file. Verification never follows
`manifest.sourceBundleDir`, any saved model location, or attachment locations. Supply every attached
report and replay, in order. Copies can move to a fresh runtime: no saved session, optimization receipt
or original workspace is required. The fresh runtime must provide the same POKIE runtime and
dependencies and unchanged authored source bytes. Changing package bytes (even a comment), evidence,
revision or template invalidates the corresponding identity; regenerate into a new destination.

Library use exposes the same interfaces:

```ts
const result = await new CertificationPackBuilder("2.0.0").buildFromBundle(
 sourceBundleDir, modes, newOrEmptyDirectory,
 {pack: {modelSource, reportFiles, replayFiles}, output: {formats: ["html", "pdf"]}, signal},
);
const issues = await new CertificationPackVerifier().verify(result.outDir, {
 sourceBundleDir: relocatedSource, pack: relocatedSources, templateFile, signal,
});
const bytes = await new CertificationPackRenderer().render(result.manifest!, "pdf", undefined, signal);
```

## Pack contents and integrity

The pack manifest schema **2** contains pack content schema **1**, presentation template schema **1**, the
original per-mode sample and analysis entries and deep-validation issues. Required sections are:

| Section | Contents and boundaries |
| --- | --- |
| identity | actual model/config hash, source folder identity, source manifest and hash, runtime version, revision labels |
| rules | authored and effective symbols, paytable, ordered and weighted reels, bets, modes, win model, mechanics, geometry, field sources, diagnostics and advanced validation |
| statistics | exact retained-library distributions, generator strategy and coverage, sampled reports, confidence intervals, seeds, workers, populations, stop reasons and explicit unavailable evidence |
| validation | deep source results at build time, declared-model assumptions and executable fidelity; verification is shallow plus independently checked samples |
| reproduction | native weighted sample selection and separately identified executable audit captures and commands, with partial-capture boundaries |
| support | preparation-only notice, complete/partial/unavailable **model representation**, limitations and absent SDK/fairness evidence |

Attachments keep the raw JSON and its raw-byte SHA-256 alongside the validated parsed value. Model
hashes, library hashes, raw round-record hashes, revision labels and pack-content hashes mean different
things. Source-folder acquisition rejects symlinks and is limited to 64 MiB / 10,000 files, excluding
`.git` and installed `node_modules`; deployed dependencies and runtime must be supplied separately. Model
JSON acquisition uses the model reader's own limits. Runtime reports must have schema 1, the matching
runtime/config identity, a reproducible seed and a worker strategy. Supplied reports are executed again
through `ParallelSimulationRunner` and compared on mathematical and statistical fields. The runtime
package is required for runtime-report and runtime-replay evidence. Native sampled outcome reports bind
`libraryHash` and mode, reproduce through the existing outcome sampler, and do not invent a config hash;
a Blueprint/PAR/WASM definition alone does not grant arbitrary execution. Unsupported codecs or missing
captures remain unavailable or partial.

Compatibility is explicit: pack format 1 supports POKIE **2.0.x** producer and build runtimes (including
prerelease/build labels), with retained **1.3.x** reading compatibility for internal engineering
evidence. Other runtime lanes and malformed versions reject with a rebuild diagnostic; origin metadata
must never be relabelled. The independent interfaces remain: descriptor and Blueprint schema 1,
simulation report schema 1, `pokie.audit-round.v1` and `pokie.session-runtime.v1`. Legacy sample-only
manifests, legacy reports and incompatible versions must be regenerated. Missing, duplicate or unknown
sections, malformed metric extensions, missing or extra inventory entries, symlinked attachments, stale
hashes and rehashed model/report/replay substitutions reject. Hash integrity does not prove authorship
or authenticity.

`evidenceContentHash` hashes every semantic manifest field, including pack attachments and template
semantic/raw-byte identities, except `generatedAt`, `sourceBundleDir` and `deepValidation.ranAt`. Those
location and time fields can differ on rebuild. Supplied raw reports remain exact files: a newly timed
simulation file has a different raw identity even when its mathematics match. Reproduction ignores
timing and command location when comparing simulation mathematics. Rendered files are bound by exact,
reproducible regeneration from the manifest, avoiding circular output-file hashes.
`result.artifactHashes` reports each published file's exact-byte SHA-256 separately.

## Metrics and templates

Formats are `json`, `console`, `markdown`, `html` and a locally generated `pdf`. YAML remains
**unimplemented, optional and non-mandatory**. No hosted renderer, browser process, global font or
private service is required. JSON keeps the full evidence; human formats share the same table view.
Report tables keep separate modes and denominators. Exact distributions describe supplied library
weights; limited or missing generator origin does not prove complete model coverage. RTP and payout
multipliers are ratios, probabilities are fractions, deviations are ratio × 100 percentage points,
monetary amounts are currency units, variance is squared ratio units and exact maximum win is currency
units. Logical-round and accepted-subround populations are distinct. Missing confidence intervals or
convergence are shown as unavailable, never zero. Formatting preserves fractional stakes and tiny
nonzero probabilities with round-trip number and scientific notation. There is no invented blended
all-mode RTP.

A template is a JSON object with exactly `schemaVersion`, nonempty `title`, `introduction` and a
permutation of **all six** mandatory `sections`:

```json
{
 "schemaVersion": 1,
 "title": "POKIE certification pack",
 "introduction": "Independent assessment preparation",
 "sections": ["identity", "rules", "statistics", "validation", "reproduction", "support"]
}
```

Customization changes the title (up to 200 characters), introduction (up to 4000 characters) and section
order only; it cannot remove identities, semantics, tables or support disclosures. Unknown fields,
missing sections, duplicate keys, incompatible versions and invalid JSON fail. There is no executable
interpolation, external stylesheet, image include, resource path or network fetch. Resource and include
requests are rejected as unknown fields. HTML and Markdown escape authored text.

PDF 1.4 uses selectable standard Courier text, wrapped two-column evidence tables, page numbers,
repeated section and column context and explicit pagination. Non-ASCII characters use **lossless
`[U+XXXX]` notation** because the self-contained standard font has no universal Unicode glyph coverage;
JSON and HTML keep Unicode text. PDF is intended for printable assessment evidence, not branded artwork.
Independent visual and PDF-reader review remains separate from source-level checks.

## Publication, cancellation and Studio

Destinations must be new or physically empty. Existing evidence is never replaced merely because
`generatedBy` says POKIE. Source/output overlap and symlink aliases reject. All files render and validate
in owned staging first. New folders publish by no-clobber namespace installation; a caller-owned empty
folder keeps its inode and receives owned no-clobber file links with `manifest.json` last as the commit
marker. Readers must require that manifest. A competing entry causes rollback of only this operation's
unchanged files, preserving the foreign entry and caller-owned folder. Authored models, packages,
workbooks, source folders, reports, replays and templates are not rewritten.

Cancellation propagates through model acquisition, sampling, simulation, rendering and commit. Runtime
leases and owned staging are drained before terminal status. Cleanup errors name the saved owned path
and are actionable failures, not confirmed-cleanup messages. Source drift is rechecked after rendering,
before commit. CLI build handles SIGINT; Studio exposes progress and cancellation through its existing
durable jobs, with captured trusted sources, template and output request identity and file hashes. Exact
active retries reattach; conflicting requests for the same output reject. Restart requires an honest
rebuild. Published results remain preparation-only.

Studio's Certification tab configures model, report, replay, revision and template paths, saves them,
invalidates stale inspection or export on edits, shows model support, and downloads all pack formats.
The bounded download route validates the saved completed job, source/evidence/template identities,
selected trusted sources and safe file inventory before returning text or PDF bytes. Changed inputs or
failed builds produce no downloadable successful pack. Simulation report downloads keep their existing
JSON/Markdown/HTML interfaces.

SDK and fairness evidence is currently explicitly **unavailable** in this pack. No profile is inferred
from a bundle or game name. Existing [SDK diagnostics](external-adapter-sdk.md) establish local target
compatibility, never provider acceptance; existing [HMAC fairness proofs](provably-fair.md) establish
only their versioned reproducible outcome-selection checks, never precommit timing or general game
fairness. These separate interfaces must not be presented as certification authority.

### Studio destinations and cancellation

Open the runtime package in Studio and choose **Certification**. Keep that package open: select its
generated outcome-library folder (for example `outcomelibrary`) as the source, select `modelSource: "."`,
and choose an explicit absolute, new or empty output folder outside that package, for example
`/work/evidence/game-pack`. Certification remains available when a native outcome library is opened
directly, but that folder is not an executable model: omit the model for visibly unavailable model
evidence, or reopen its original package for model-bound rules. Studio never infers a parent package or
substitutes one for the selected model. Relative outputs remain project-contained. Absolute output
selections reject symbolic links in existing ancestors; all destinations still pass the builder's
physical source/output overlap and ownership checks. Build, saved request identity, retry/recovery and
download revalidation resolve the same destination. Inputs remain project-local and are never copied to
enable this workflow.

Deep validation, regenerated pack validation and native sample verification accept cancellation.
Verification returns an error diagnostic after cancellation and starts no later phase. Studio aborts
and drains download reproduction on disconnect, project close/change and shutdown. Invalid trusted-source
fingerprints are saved as failed certification jobs with correction/rebuild guidance and no downloads.
The shared human-readable rules view keeps every authored and effective field, including paylines,
wild/scatter roles, dimensions and reel-generation inputs. `report --template` is pack-only, including
when the input resolves to an outcome library or Stake export.
