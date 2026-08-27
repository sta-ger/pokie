# PC-03 — blind Studio import and artifact handoff

Candidate: `8bf3751ed6eb9675889b9b257a807dad03356e87`.

## Boundary

On 2026-08-27, the candidate was built once and Studio was launched once from
this checkout exactly with `node ./dist/cli/pokie.js --no-open`. The actual
exploration used a new, isolated Chromium profile, Studio home, registry, and
project root. It used only rendered public Studio controls and its rendered
documentation links; it did not inspect source, call private APIs, inject
state, or alter product code or tests. All temporary profiles, generated
project/output trees, browser logs, and automation remain unretained.

## Fresh-profile transcript

1. The public start screen rendered Design Your Game, its public documentation
   links, valid starter sections, and `Choose a different start`.
2. `Choose a different start` → `Open a saved game design` rendered the Saved
   game design form. Before a path was supplied, the form rendered:
   `"…/dist/cli/studio-client" is a folder, not a file. Point this at a file
   instead, or use Browse to pick one.`
3. The explorer pressed the rendered `Browse…` control. Its rendered picker
   showed navigation and `Cancel`; Cancel returned to the Saved game design
   form. `Back` then returned to the start choices. This is the import attempt,
   its visible result, and its recovery; no private or fabricated filename was
   used.
4. `Use the starter game` eventually created `Starter Slot Overview` with
   `Created in Studio`, `Editable`, and `Valid — no issues found`. An earlier
   readiness wait expired while the starter dialog was still settling; the
   later rendered Overview proves creation succeeded, so that threshold is not
   recorded as a product failure.
5. Overview → `Build/Export` rendered the local Outcome library generator,
   Stake Engine Export, TypeScript Game Package, Outcome library, Stake Engine
   export, optional destinations, Build preflights, Browse controls, and the
   unavailable remote-delivery description.
6. One rendered click on `Generate exact outcome library (base)` first showed
   `Generating outcome library from this project's current build…`, then
   settled at `Generated 1,024 outcomes for mode "base" using exact (RTP
   100.78%) into outcomelibrary.`
7. That settled artifact naturally enabled `Run Stake Engine Export (base)`.
   One rendered click on it settled at `Exported 4 file(s)` and exposed `Open
   output folder`. The generated files and output folder were deleted after
   observation rather than retained as evidence.

## Surface ledger

| Surface | Rendered states / conclusion |
| --- | --- |
| Saved-design import | Form, Browse picker, Cancel recovery, disabled Open without a selection, and the erroneous prefilled-directory validation message all rendered. |
| Starter creation | Checking/loading language, a settling start dialog, valid success, and created editable Overview rendered. |
| Build/Export | Local output-generator and package/export cards, optional destinations, ready preflights, disabled-before-prerequisite text, and remote delivery unavailable all rendered. |
| Artifact reuse/handoff | Generator pending → exact-library success → enabled Stake Engine handoff → exported success. |

The similarly named Outcome library generator and Outcome library Build cards
are separate rendered capabilities: the former says it supplies export and
delivery options; the latter is a standalone build artifact. No contradictory
duplicate action was observed. No stale state was observed after import
recovery or either settled artifact operation.

## Finding retained without remediation

**PC-03-P2-01 — spurious saved-design error (P2).** A blank fresh-profile
Saved game design form reports that this checkout's `dist/cli/studio-client`
directory is not a file before the explorer enters or selects anything. The
error names a location the explorer did not choose, so it is misleading
first-contact import state. The rendered Browse/Cancel and Back paths still
recover cleanly. This verification did not inspect or remediate its cause.
