# PC-05 — coherent product model and acceptance ownership

## Evidence considered

PC-05 freezes the model at `71f8bfa9`, after the independent records from
PC-02 (fresh installed CLI), PC-03 (blind Studio) and PC-04 (role missions).
Their result is deliberately not collapsed into screenshots: PC-02 contributes
four CLI handoffs, PC-03 contributes one frozen Studio replacement/recovery
finding, and PC-04 establishes that the PAR, package, Outcome Library and
Stake round trips are reachable.  The capability matrix owns every resulting
mismatch and duplicate path.

## Product promise

POKIE helps a game author achieve five user goals:

1. Design an editable game.
2. Make it runnable or make its finite outcome space inspectable.
3. Analyze, replay and audit the chosen result source.
4. Exchange or deploy a derived artifact without implying a lost source can be
   reconstructed.
5. Prove a particular outcome or certify a frozen outcome library.

The internal stages that implement those goals are not user goals: resolve a
path, validate a source, materialize a package, generate/register a compatible
Outcome Library, project records into an adapter format, write atomically, and
then report a result.  A UI and CLI must describe the goal first; they may show
the stage progress as supporting detail.  They must never expose a missing
internal filename as the primary explanation of a user-facing incompatibility.

The canonical source flow is:

```text
Blueprint ──build──> TypeScript package ──run──> session / RoundArtifact
    │                    │                         │
    ├──PAR export/import─┘                         └──best-effort replay
    │                    │
    └──generate/resolve──> Outcome Library ──> exact sim/replay/serve
                              │       │  └──> certification/fairness
                              │       └──> external deployment target
                              └──> Stake Engine export ──import──> Outcome Library
```

The two branches have different guarantees.  A TypeScript package executes
game logic; native Outcome Library operations select pre-generated outcomes.
The latter can be exact only when the descriptor retains matching library hash,
mode, seed and round.  A Stake export remains analyzable but read-only until
converted back to a native library.  PAR is editable exchange input, not a
runnable project.  WASM is metadata inspection only.

## Loss, provenance, stale and compatibility rules

| Situation | Required product meaning | Required diagnostic / recovery |
| --- | --- | --- |
| A source is of the wrong artifact kind | Do not infer conversion from an internal missing file. | Name the supplied kind, supported kinds and a next action. |
| A conversion loses game-model information | Stake import reconstructs outcomes, not the original Blueprint; adapter output never promises model recovery. | State the loss before/after conversion and preserve source hash/provenance where available. |
| A result’s source changed | Derived package/library/report/replay/certification result is stale, not silently current. | Mark stale or clear it before a dependent action; offer revalidate/rebuild/replay with the current source. |
| Exact replay/proof/certification has incompatible provenance | Hash, mode, source and relevant commitment identity are contracts. | Fail closed; state which identity disagrees and require the matching source/descriptor. |
| A destination exists or is unsafe | No output may replace an unrelated artifact. | Refuse atomically and say whether a different `--out` or empty destination is needed. |
| A capability is absent by design | WASM has no POKIE producer/runtime; generic Stake has no native draw contract. | State the boundary and the supported alternative, never imply a hidden command. |

## Systemic defect taxonomy

| Taxon | Definition | Current instances | Acceptance owner |
| --- | --- | --- | --- |
| Capability contradiction | Two public surfaces assert incompatible prerequisites/availability. | PC-05-CLI-01; package vs Outcome Library run semantics. | PC-06 |
| Grammar/output divergence | Rendered help or generated follow-up command differs from parser/shell reality. | PC-05-CLI-03, PC-05-CLI-04. | PC-06 |
| Artifact-kind diagnostic failure | Failure names an implementation shape instead of the user artifact and recovery. | PC-05-CLI-02. | PC-06 |
| Destructive/replacement recovery failure | An import/open action destroys or replaces editable context without an explained recovery. | PC-05-STUDIO-01. | PC-07 |
| Cross-surface capability asymmetry | One client offers a lifecycle subset without an explicit handoff/boundary. | PC-05-STUDIO-02: certification verify; deployment CLI absence. | PC-08 |
| Duplicate conversion ownership | Several entry points own the same conversion semantics. | PC-05-DUP-01: build/export/specialised artifact commands. | PC-08 |
| Runtime-source semantic duplication | The same verb means runtime execution for one source and pre-generated selection for another. | PC-05-DUP-02: simulation/replay/serve. | PC-06 |
| Validation surface asymmetry | Clients expose different portions of a target-specific validation lifecycle. | PC-05-DUP-03: Blueprint/library/Stake/certification validation. | PC-08 |
| Documentation/contract drift | Docs, defaults, presentation and shared resolver are maintained separately. | PC-05-DOC-01: prerequisite claims and WASM boundary. | PC-09 |

## Acceptance ownership

PC-05 itself changes no product behavior.  It supplies the fixed registry,
matrix, taxonomy and closure ledger required before remediation.  Later work
must close an owned row rather than merely create a new observation:

| Step | Owns | Required proof |
| --- | --- | --- |
| PC-06 capability, CLI and provenance sweep | CLI-01 through CLI-04; exact/best-effort and incompatible-artifact diagnostics | focused CLI contracts exercise accepted/default/rejected forms and source kind recovery |
| PC-07 Studio-source recovery | Studio saved-design replacement behavior | a real selection path shows retained prior design or a valid imported design plus recovery explanation |
| PC-08 cross-surface and duplicate sweep | conversion entry points, Studio certification verification handoff, runtime/report parity, deployment decision | one canonical contract per user goal, with parity/intentional absence explicitly tested |
| PC-09 public-docs and unsupported-boundary sweep | documentation, defaults, WASM and generated action language | documentation claims, help and shared contracts agree on supported sources, prerequisites and exclusions |

No row is closed by a screenshot alone.  It closes only when the affected
goal, persisted observable result, failure/disabled path and provenance rule
all agree across the entry points named in the matrix.
