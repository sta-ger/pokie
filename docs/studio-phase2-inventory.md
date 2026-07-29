# POKIE Studio Phase 2 UX/contract inventory (v1)

**Status:** baseline, frozen 2026-07-29 against implementation commit `30b1dd4` (route/tab baseline) plus the
executable fixtures added in `[P2-POLISH-01]`. Written *before* any Phase 2 redesign work touches Studio's
Advanced tabs, so a future redesign step can diff its own intended changes against this document instead of
guessing what "before" looked like.

**Scope:** every named global/project workflow (Design & Build, Raw Editor, Advanced Tools, Open Project,
Replay, Runtime, Certification, Provably Fair, Deployment, Outcome Libraries, Stake Engine Export) — for each,
what routes/tabs/Steppers exist, every path field and its placeholder, every disabled action and its gating
condition, every place an empty input is silently inferred rather than rejected, every placeholder that could
be mistaken for a real value, and every raw-error surface (a caught exception's message shown to the user with
no added remediation text). Each finding is backed either by an **executable fixture** (cited by file + test
name) or, where a fixture would be redundant with existing fine-grained coverage or not worth the interaction
cost to automate, by **evidence** (a `file:line` citation into the current implementation).

**Not in scope:** this is a documentation/regression-fixture baseline, not a redesign. No production UI
changes are described or implied here — every "finding" below is the *current, frozen* behavior, called out
so a later redesign step has to make an explicit, reviewable decision about it rather than silently keep or
lose it.

**Versioning:** increment the version marker above whenever a Phase 2 redesign step intentionally changes one
of the frozen facts recorded here — this document should never quietly drift out of sync with the fixtures it
describes. See `docs/studio-frontend.md` for the living implementation narrative (stack, IX architecture,
directory layout, testing setup) this document does not duplicate.

## How to read each workflow section

- **Route/tab evidence** — where the workflow lives and how it's reached.
- **Stepper** — the ordered step list and its gating, cross-referenced against the classification table in
  `docs/studio-frontend.md`'s "Stepper vs. other step/wizard UI" audit.
- **Path/text fields** — every field a user types a path or identifier into, with its placeholder (or lack of
  one) and default/empty-value behavior.
- **Disabled actions** — every button that can be disabled, and the exact condition.
- **Inferable empty inputs** — where a blank field is silently defaulted/omitted rather than rejected.
- **Misleading placeholders** — placeholder text realistic enough to be mistaken for a filled-in value.
- **Raw-error surfaces** — where a caught exception's `.message` (via `domain/errorMessage.ts`) is shown
  verbatim through the shared `common/ErrorState.tsx` (`role="alert"`, renders `{message}` with **no** added
  wrapping, retry copy, or remediation text — confirmed at the component level, so this is a single systemic
  pattern, not 7 independent ones).

---

## Design & Build / Raw Editor / Advanced Tools / Open Project

Already covered in depth by `tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx`'s first
three `describe` blocks (route table, Home tab inventory, Project Dashboard tab inventory, New Blueprint
action surface) and by `docs/studio-frontend.md`'s own UX/Information-architecture section, including the
dirty-navigation guard, the sectioned Design & Build layout, and the guided Stepper→`StepProgressList`
conversion. Not re-summarized here; those two documents are the baseline for this group.

---

## Replay (`project/ReplayTab.tsx`)

**Route/tab evidence:** `/project/replay`, `section: "Advanced"` (`ProjectDashboardPage.tsx:76`). Covered by
`Advanced tab Stepper inventory baseline` → *"Replay: Find, Load, Reproduce, Inspect, Export, in that order"*
(executable).

**Stepper** (`ReplayTab.tsx:221-237`) — Find → Load → Reproduce → Inspect → Export. Reproduce is
`disabled={findMethod === "spin"}` (227); Inspect/Export both `disabled={!inspectReachable}` /
`{!exportReachable}` (233, 236), where `inspectReachable = (findMethod === "spin" && selectedSpin !== undefined)
|| result !== undefined` (202). Matches the "Partially linear" classification in `docs/studio-frontend.md`'s
Stepper audit table. Order pinned by the fixture above; the fine-grained gating/aria-current/free-navigation
behavior is already exhaustively covered by
`ProjectDashboardPage.replayWorkflow.test.tsx` (not re-tested here).

**Path/text fields:** none. `ReplayTab.tsx` has no `PathInput`/`PathBrowseModal` usage and no `placeholder`
prop anywhere (grep-confirmed). Its only text-style inputs are a "Round" `NumberInput` (default 1) and a
"Seed (optional)" `TextInput` (default `""`), neither a path.

**Disabled actions:** Stepper steps as above; "Validate & continue" `disabled={artifactText.trim() === ""}`
(280); "Continue to Reproduce" (artifact flow) `disabled={artifactReproducibility?.status === "blocked"}`
(496).

**Inferable empty inputs (evidence only):**
- Seed field: `values.seed.trim() || undefined` (258) — blank/whitespace silently becomes "no seed" rather
  than being rejected; already exercised incidentally by `replayWorkflow.test.tsx`'s existing seed cases.
- Recent Simulation round picker: an empty/invalid value is silently coerced to `1` (441).

**Misleading placeholders:** none — no `placeholder` prop exists anywhere in this file.

**Raw-error surfaces (evidence only — not re-demonstrated as a fixture here, since
`replayWorkflow.test.tsx` already exercises these paths in depth):** `error` from `useReplayPoll` (537);
job `progress.error` fallback to `"Replay failed."` (536); artifact-validation `expected.message` (473);
`listError` (296, 768); `recentSpinsError` (336); `recentRunsError` (411). All pass straight into
`<ErrorState>` with no remediation text.

---

## Runtime (`project/RuntimeTab.tsx`)

**Route/tab evidence:** `/project/runtime`, `section: "Advanced"` (`ProjectDashboardPage.tsx:77`). Covered by
the Stepper-inventory fixture (Debug-never-gated assertion), the inferable-empty-input fixture (Start with a
blank Host/Port/seed), and the raw-error-surface fixture (a failed status fetch) — all executable.

**Stepper** (`RuntimeTab.tsx:425-445`) — Create or restore session → Play → Inspect round → Continue session →
Debug. Play/Continue session `disabled={!sessionReachable}` (431, 441); Inspect round
`disabled={!inspectReachable}` (435); Create/restore and **Debug** carry no `disabled` prop at all —
confirmed executable in this baseline (`Debug ... not.toBeDisabled()`), matching the audit table's own "Debug
is deliberately always reachable regardless of session state" note. Debug's own *content* (retry/debug
buttons) is separately gated — see Disabled actions below.

**Path/text fields:** none are filesystem paths; no `PathInput` usage anywhere in this file (grep-confirmed).
Plain fields: Host (`placeholder="127.0.0.1"`, optional), Port (no placeholder, optional), Default seed (no
placeholder, optional), per-session Seed/Session id/Request id override/Expected session version override (no
placeholders).

**Disabled actions:** Start `disabled={running}`; Stop `disabled={!running}`; "Retry last request (same
request id)" and "Debug this round in Replay & Debug" both
`disabled={!sessionReachable || lastSpin.requestId === undefined}` (641, 646) — this is the
requestId-idempotency-key gating surfaced in the UI. Load Session has **no** `disabled` guard for a blank id;
see below.

**Inferable empty inputs (executable — see `Advanced tab inferable-empty-input baseline`):** blank
Host/Port/Default seed on Start are omitted from the request body entirely (`readOptions()`,
`RuntimeTab.tsx:34-38`), not sent as empty strings and not rejected — pinned by asserting the captured
`fetch` body equals `{debug: false, repositoryMode: "memory"}` with no `host`/`port`/`seed` keys at all.
**Evidence only:** Load Session's id field is not disabled-gated at all — a blank/whitespace id just makes the
click handler no-op (`restoreSessionId.trim() && handleLoadSession(...)`, 494) with zero feedback, rather than
disabling the button or showing a validation message. This is a **fail-open UX gap** worth flagging for
redesign: the user gets no signal that clicking did nothing.

**Misleading placeholders:** Host's `"127.0.0.1"` placeholder (348) is flagged as a soft risk — it could read
as a pre-filled default on an otherwise-empty, "(optional)"-labeled field. Not demonstrated as a fixture
(cosmetic finding, no functional consequence — the field really is optional and really is empty).

**Raw-error surfaces:** the status-fetch failure is demonstrated as an executable fixture here. **Evidence
only** for the rest (already covered in depth by `runtimeWorkflow.test.tsx`'s own "network down" assertions,
per that file's line 753/787-789): round-outcome `session.message` (RuntimeTab.tsx:163-165, contrast with the
friendlier `RecoveryNotice` treatment just above/below it for "blocked"/"conflict" states — RuntimeTab is the
**one exception** among all 7 Advanced tabs that sometimes wraps an error in friendlier copy, not just raw
passthrough); recent-spins fetch error (508, 611).

---

## Certification (`project/CertificationTab.tsx`)

**Route/tab evidence:** `/project/certification`, `section: "Advanced"` (`ProjectDashboardPage.tsx:81`).
Covered by the Stepper-inventory, path-field/disabled-action, and raw-error-surface fixtures (all executable).

**Stepper** (`CertificationTab.tsx:284-309`) — Select/configure → Validate → Build bundle → Inspect → Export.
`validateReachable = bundleDir.trim().length > 0` (194); `buildReachable` requires a non-`"invalid"` Validate
outcome (196); `inspectReachable = buildResult !== undefined` (204); Export reuses `inspectReachable` (307) —
it has no independently-gated condition of its own. No backward lock on any step once reached, matching the
audit table's "Partially linear" classification.

**Path/text fields (executable):** "Source outcome-library bundle directory"
(`placeholder="./outcomes/bundle"`); per-mode "Mode name" (`placeholder="base"`) and "Seed"
(`placeholder="cert-2026-07-20-base"`); "Output directory" (Build step only, **no placeholder**, defaults to
the non-blank value `"certification"` rather than empty). One empty mode row exists by default
(`EMPTY_MODE`, `modes: [EMPTY_MODE]`, line 97).

**Disabled actions (executable):** "Continue to Validate" `disabled={!validateReachable}` (367); "Build
certification bundle" `disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}` (252).

**Inferable empty inputs (evidence only):** an untouched ("empty") mode row is silently filtered out of the
submitted payload (`toModeInputs`, 67-69) with no warning — only a *touched-but-invalid* ("incomplete") row
blocks Build; Sample count's `onChange` coerces any non-numeric/cleared value to `0`
(`Number(value) || 0`, 351) rather than rejecting the keystroke.

**Misleading placeholders (executable, flagged not changed):** the Seed placeholder
`"cert-2026-07-20-base"` embeds a real-looking date+mode-name pattern rather than an obviously-fake token —
pinned by the path-field fixture with an inline comment, not altered.

**Raw-error surfaces (executable for Validate; evidence only for Build):** Validate's `network-error`/
`load-error` states (`ErrorState message={validateView.message}` / `.error`, 221-222) are demonstrated end to
end by the raw-error-surface fixture (type a bundle dir → Continue → Validate → assert the exact server-
supplied text renders with no remediation copy). Build's identical pattern (256-257) is evidence-only — same
component, same passthrough, not separately re-demonstrated.

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new "Contract baseline: Certification"
block pins that `validateCertificationBuildRequest`'s mode-shape check is **type-only** — it accepts a
negative or non-integer `sampleCount` that the UI's own `isModeValid` (`sampleCount > 0 && Number.isInteger`)
would never let through as "valid." The gap is closed later by `CertificationEvidenceBundleBuilder`'s
domain-level pass, not at this request-validation layer — a **fail-open contract layer, fail-closed domain
layer** combination, deliberately unchanged here.

---

## Provably Fair (`project/ProvablyFairTab.tsx`)

**Route/tab evidence:** `/project/provablyFair`, `section: "Advanced"` (`ProjectDashboardPage.tsx:82`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`ProvablyFairTab.tsx:237-252`) — Configure → Generate/inspect proof → Verify → Review
diagnostics. `generateReachable = configureView.status === "ok"` (219) gates step 1 only; `Verify` (245) has
**no** `disabled` prop at all — confirmed executable (`steps[2] not.toBeDisabled()`), matching the audit
table's "Verify is always reachable regardless of prior state" note; `diagnosticsReachable = verifyResult !==
undefined` (227) gates step 3.

**Path/text fields (executable):** "Source outcome-library bundle directory"
(`placeholder="./outcomes/bundle"`, Configure step); a second, separate "Source outcome-library bundle
directory" field on the Verify step carries **no placeholder** and is auto-populated from the Configure
field's value only after a successful Configure (134) — not re-demonstrated as a fixture (evidence only, see
`ProvablyFairTab.tsx:428-436`); "Server seed" (`placeholder="operator-server-seed"`); "Client seed"
(`placeholder="player-client-seed"`); "Mode name" (`placeholder="base"`).

**Disabled actions (executable):** "Compute commitments" `disabled={!isConfigureValid(fields)}` (292) — all
four of bundleDir/modeName/serverSeed/clientSeed must be non-blank; nonce is never required, pinned by the
fixture leaving it at its default. **Evidence only, flagged as a gap:** the "Verify" button's own `disabled`
condition (438) does not include the Verify-step bundle-dir's own blank check that `runVerify` itself enforces
(197-199) — the button can be enabled while that field is blank, and clicking it then silently no-ops with
zero feedback, the same fail-open pattern as Runtime's Load Session.

**Inferable empty inputs (evidence only):** Nonce's `onChange` coerces any falsy/NaN input to `0`
(`Number(value) || 0`, 288); the Verify-step bundle-dir auto-fill from Configure noted above is a silent
(non-empty-triggered) auto-fill, not a rejection.

**Misleading placeholders (executable, flagged not changed):** Server/Client seed placeholders read like real
seed labels rather than obviously-fake tokens; Mode name's `"base"` placeholder is a real, valid mode name,
indistinguishable from an actual selected value. Pinned by the path-field fixture.

**Raw-error surfaces (evidence only):** Configure's `error`/`load-error`/`invalid` states (296-298); Generate's
`error`/`load-error`/`build-error` (349-351, the last concatenating a raw `code:` prefix onto the raw
message); Verify's `error`/`load-error` (442-443). Not separately re-demonstrated as a fixture here — same
`ErrorState` passthrough pattern already pinned by the Certification/Deployment/Runtime/Replay fixtures.

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new "Contract baseline: Provably Fair"
block pins that `validateFairnessVerifyRequest` never checks `commitment` at all — not its shape, not even
its presence — while the UI's own `resolveVerifyInputs` requires both a proof *and* a commitment before
enabling "Verify." A request built outside this UI (or a future, more permissive UI) can ask the server to
verify a proof with no commitment; `FairnessRoundProofVerifier`'s own structural checks are the only thing
that actually catches that, not this request-validation layer.

---

## Deployment (`project/DeploymentTab.tsx`)

**Route/tab evidence:** `/project/deployment`, `section: "Advanced"` (`ProjectDashboardPage.tsx:78`). Covered
by the Stepper-inventory, path-field, and raw-error-surface fixtures (all executable).

**Stepper** (`DeploymentTab.tsx:283-304`) — Select target → Configure → Check compatibility → Preview
artifacts → Deploy → Review result. Unlike every other Advanced tab, **Configure itself is gated**
(`disabled={selectedTarget === undefined}`, 288) — confirmed executable (all 5 non-"Select target" steps
`toBeDisabled()` before a target is picked). `compatibilityChecked`/`previewReachable`/`canContinueToDeploy`/
`reviewReachable` (269-272) gate the remaining four. A `pendingAdvanceStepRef` stale-result guard
(213-221) only auto-advances on a genuinely new, non-stale `runResult`; losing `runResult` snaps `activeStep`
back to 1, and losing `selectedTarget` snaps it back to 0 (227-243) — backward-*correcting* guards, not
backward-*blocking* ones, matching the audit table.

**Target registry / preflight (evidence only):** the target list (`TargetsList`, 37-86) renders each target's
id/version/requirements/capabilities from `GET /api/project/deployment/targets`; "Check & Preview" runs
without writing (`publish: false`), "Deploy" additionally publishes (`publish: true`) —
distinguished purely by `runResult.publish`, never a separate client-side flag (276-281).

**Path/text fields (executable — the one tab where the finding *is* the absence):** "Mode name" and
"Outcome library path" (335-344) are plain `TextInput`s with **no placeholder at all** — confirmed by the
path-field fixture (`not.toHaveAttribute("placeholder")`), unlike every other tab's equivalent path fields.

**Disabled actions:** only the five gated Stepper steps carry a `disabled` prop; no plain `<Button>` in this
file does — "Check compatibility & preview" and "Deploy" stay clickable while a run is in flight (`loading`
only), with double-submission instead absorbed upstream by `DeploymentRunTracker` (already covered by
`deploymentRunTracker.test.ts`, not re-tested here).

**Inferable empty inputs:** none found — `handleDeploy` returns early on an undefined `selectedTarget` rather
than defaulting it; mode fields have no fallback/trim/default applied in this file.

**Misleading placeholders:** none — no `placeholder` prop exists anywhere in this file (the absence-of-
placeholder finding above is the relevant one for this tab).

**Raw-error surfaces (executable for the targets-fetch case; evidence only for the rest):** `targetsError`
(314) is demonstrated end to end by the raw-error-surface fixture (mount-time targets fetch failure → exact
server text, no remediation). `runError` under Configure (361) and under Deploy (456) are the same passthrough
pattern, evidence-only here (already covered by `deployment.test.tsx`/`deploymentWorkflow.test.tsx`'s own
error-path assertions).

**Contract cross-reference:** the pre-existing "missing package-to-library" finding in
`StudioRequestContractBaseline.test.ts` (added before this baseline) already covers Deployment's own
`modeName`-never-checked-against-the-package gap in depth; not repeated here.

---

## Outcome Libraries (`project/OutcomeLibrariesTab.tsx`)

**Route/tab evidence:** `/project/outcomeLibraries`, `section: "Advanced"` (`ProjectDashboardPage.tsx:79`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`OutcomeLibrariesTab.tsx:345-365`) — Select/import → Validate & analyze → Inspect → Compare or
use. Step 1 `disabled={!analyzeReachable}` (350), where `analyzeReachable` is any *terminal* select status
(ok/invalid/error/load-error, 266) — not specifically success; steps 2/3 both
`disabled={!inspectReachable}` (356, 362), where `inspectReachable = selectResult !== undefined`, i.e.
`selectView.status === "ok"` only (267). `onStepClick={setActiveStep}` (345) has no backward-lock logic —
once a step is enabled it stays clickable both directions.

**Selector kinds (evidence only, structurally exercised by the path-field fixture's default-kind
assertion):** a `SegmentedControl` (json/bundle/stakeengine) drives which field group renders — json → one
"Library JSON path" field; bundle → "Bundle directory" + "Mode name"; stakeengine → "Stake Engine export
directory" + "Mode name". `buildSelector()` (40-52) requires the relevant field(s) non-blank per kind before
"Load library" enables.

**Path/text fields (executable for the default json kind):** "Library JSON path"
(`placeholder="./outcomes/base.json"`); evidence-only for the other two kinds: "Bundle directory"
(`placeholder="./outcomes/bundle"`), "Stake Engine export directory" (`placeholder="./stake-export"`), "Mode
name" (`placeholder="base"`, shared by both kinds).

**Disabled actions (executable for the json-kind case):** "Load library"
`disabled={buildSelector(fields) === undefined}` (371). Evidence-only: "Compare"
`disabled={buildSelector(rightFields) === undefined}` (496); "Run deep validation" is not `disabled`-gated in
JSX at all, only rendered when `fields.kind === "bundle"` and no-ops internally if busy (212, 300); "Use in
runtime" similarly no-ops internally (599-602) rather than being `disabled`.

**Inferable empty inputs:** none found — every selector field is trimmed, and if empty, `buildSelector`
returns `undefined`, which disables the relevant action rather than substituting a default.

**Misleading placeholders (executable for the json kind; evidence-only for bundle/stakeengine):** all four
selector-field placeholders read as plausible real paths/mode names rather than obviously-illustrative text —
mitigated in practice by "Load library" staying disabled until real text replaces the placeholder, but the
strings themselves are the same pattern flagged elsewhere in this document.

**Raw-error surfaces (evidence only — already covered by
`outcomeLibrariesWorkflow.test.tsx`'s own success/invalid/compare/stale/late-response cases, none of which
assert on the raw-error text specifically):** `selectView` error/load-error (375-376), `deepValidateView`
error/load-error (311-312), `compareView`/`compareResult` error/load-error (501, 513, 519) — seven distinct
call sites, all the same `ErrorState` passthrough. Not re-demonstrated as a fixture here; flagged as the
largest evidence-only surface in this document by call-site count, worth prioritizing if this baseline is
ever extended with more executable raw-error fixtures.

---

## Stake Engine Export (`project/StakeEngineExportTab.tsx`)

**Route/tab evidence:** `/project/stakeEngineExport`, `section: "Advanced"` (`ProjectDashboardPage.tsx:83`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`StakeEngineExportTab.tsx:343-365`) — Configure → Preview → Validate diagnostics → Export →
Review result. `configureValid` (202, ≥1 valid mode, no incomplete row, non-blank `outDir`) gates
Preview/Validate (203-204); `exportReachable` (206) additionally requires a non-`"invalid"` Validate outcome;
`reviewReachable` (213) requires an export result. **Not strictly forward-monotonic in practice:** because
these booleans are recomputed every render rather than cached once reached, editing a mode field after
reaching a later step can retroactively re-lock Preview/Validate/Export — a nuance the audit table's "no
backward lock" phrasing doesn't fully capture; flagged here for a future redesign to consider explicitly.

**Path/text fields (executable):** "Output directory" (`placeholder="./stakeengine"`, but defaults to the
non-blank `"stakeengine"` — confirmed executable that the placeholder is therefore **structurally
unreachable**, since the field is never actually empty for a user to see it); per-mode "Mode name"
(`placeholder="base"`) and "Outcome library path" (`placeholder="./outcomes/base.json"`). One empty mode row
exists by default (`EMPTY_MODE`, line 97). No overwrite checkbox exists as a form field — overwrite is a
post-conflict `RecoveryNotice` action instead (305-313), not a field.

**Disabled actions (executable):** "Continue to Preview" `disabled={!previewReachable}` (424); "Export to
Stake Engine" `disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}` (298, evidence only).
"Run diagnostics" is never `disabled`-gated in JSX; it silently no-ops if there are no modes or the guard is
busy (146-148) — the same fail-open button-stays-clickable-but-inert pattern as Outcome Libraries' "Run deep
validation."

**Inferable empty inputs:** Cost's `onChange` coerces any unparsable/NaN input to `0`
(`Number(value) || 0`, 412) — same pattern as Certification's Sample count and Provably Fair's Nonce, a
cross-cutting `NumberInput` convention across all three tabs, not tab-specific.

**Misleading placeholders (executable, flagged not changed):** "Output directory"'s placeholder is dead code
in practice (see above); "Mode name"/"Outcome library path" read as plausible real values, same pattern as
Certification/Outcome Libraries.

**Raw-error surfaces (evidence only):** `validateView` network-error/load-error (232-233); `exportView`
network-error/load-error/non-overwritable-conflict (303-304, 315); the overwritable-conflict case (307-313)
is the **one partial exception** among all raw-error surfaces in this document — it pairs the raw error text
(used as a `RecoveryNotice` title) with an actionable "Overwrite" button, unlike every purely-informational
`ErrorState` elsewhere.

---

## Cross-cutting findings

**Raw-error passthrough is systemic, not per-tab.** `common/ErrorState.tsx` renders `{message}` verbatim
inside an `Alert` with zero added text, and every Advanced tab except `RuntimeTab.tsx` (which wraps two
specific cases — "blocked"/"conflict" session states — in a friendlier `RecoveryNotice`) and
`StakeEngineExportTab.tsx` (whose overwritable-conflict case does the same) passes a raw,
`domain/errorMessage.ts`-derived string straight through. This baseline demonstrates the pattern executably
for 4 of the 7 Advanced tabs (Deployment, Runtime, Replay, Certification) across both trigger shapes
(mount-time GET failure and interactive POST failure); the remaining occurrences (enumerated per-workflow
above) are evidence-only, since they're either already exhaustively covered by each tab's own dedicated
workflow test or would add near-duplicate fixtures of an already-proven, component-level-verified pattern.

**The `Number(value) || 0` `NumberInput` coercion convention** appears identically in Certification's Sample
count, Provably Fair's Nonce, and Stake Engine Export's Cost — an unparsable/cleared numeric field silently
becomes `0` rather than rejecting the keystroke or leaving the field visibly invalid. Documented as evidence
in each tab's section above rather than triplicated as near-identical fixtures.

**Two fail-open "silent no-op" buttons** were found that are *not* `disabled`-gated for their actual
precondition, unlike the disabled-action convention used everywhere else in these tabs: Runtime's Load
Session (blank id → silent no-op) and Provably Fair's Verify button (blank Verify-step bundle dir → silent
no-op despite the button itself being enabled). Both are evidence-only findings, flagged here as UX gaps
worth an explicit decision in the Phase 2 redesign (either disable the action or surface the same validation
message `runVerify`/`handleLoadSession` already compute internally).

**Deployment's Configure step is the only Advanced-tab first content step gated behind a *previous* step's
selection** (`selectedTarget === undefined`) rather than being immediately reachable — every other tab's
first step (Select/configure, Configure, Select/import) is always enabled. Evidence, not a defect: Deployment
inherently has nothing to configure before a target is chosen.

## Contract findings summary

`tests/cli/studio/StudioRequestContractBaseline.test.ts` now covers, as executable request/response-contract
fixtures: New Blueprint (Create/Open/Apply), Runtime retry/debug (requestId/expectedSessionVersion,
debug/repositoryMode defaults), Deployment vs. Stake Engine Export (targetId+publish vs. outDir+overwrite+cost,
and the pre-existing "missing package-to-library" finding — neither Deployment's nor Stake Engine Export's
`modeName` is cross-checked against the project's actual bet modes at the request layer), Outcome Libraries
selector kinds, **Certification** (validate-source vs. build shape, and the new "shape-only mode check" finding
— `sampleCount` is only type-checked, not range-checked, at this layer), and **Provably Fair** (configure/
generate/verify shape, and the new "unchecked commitment" finding — Verify never validates `commitment` at
all, narrower than the UI's own pre-Verify gating).

## Assumptions

- Every fixture in this baseline assumes the same fake-fetch seam (`createRoutedFakeFetch`) and routed-app
  harness (`renderRoutedApp`) already used by the rest of `tests/cli/studio-client/`; no new test
  infrastructure was introduced.
- Route response bodies used for new fixtures (e.g. the Deployment target shape
  `{id, version, requirements, capabilities}`) were taken from the exact shape already used by
  `ProjectDashboardPage.deploymentWorkflow.test.tsx`'s own `TARGET` fixture, not invented independently.
- "Executable fixture" in this document always means a test that renders through the real routed app (not a
  shallow/unit render) and asserts on real DOM roles/text/attributes, matching this repo's existing
  convention for these baseline files.

## Deferred unknowns / unresolved findings

These are **not** backed by an executable fixture in this baseline and are called out explicitly rather than
silently assumed covered:

1. Outcome Libraries' seven raw-error call sites (select/deep-validate/compare, ×2 for load-error variants) —
   evidence-only, the largest single evidence-only surface in this document.
2. Provably Fair's Verify-step "blank bundle dir → silent no-op despite an enabled button" gap, and Runtime's
   analogous Load-Session gap — flagged as fail-open UX, not exercised by a fixture proving the no-op (only
   documented from source).
3. Stake Engine Export's non-monotonic Stepper gating (re-locking a later step by editing an earlier one after
   the fact) — documented from source reasoning about the recomputed-every-render booleans, not exercised by
   a fixture that actually reaches a later step, edits Configure, and asserts the re-lock.
4. Outcome Libraries' bundle/stakeengine selector kinds' path fields/placeholders — documented from source,
   only the default json kind is exercised end to end by a fixture.

A future extension of this baseline should prioritize (1) and (3) first, since they're the two findings this
document states from source reading alone without any executable proof.

## Fail-closed expectations

Where "fail closed" means: an error, a missing precondition, or an ambiguous state should visibly block the
risky action rather than silently proceeding or silently doing nothing.

- **Correctly fail-closed:** every Stepper gating boolean documented above blocks forward navigation via a
  real `disabled` attribute (confirmed executable for every tab in this baseline) rather than a purely visual
  cue; Certification/Stake Engine Export's "incomplete" (touched-but-invalid) mode rows block Build/Export via
  `hasIncompleteModeRow` rather than being silently dropped like "empty" (never-touched) rows are.
- **Not fail-closed (fail-open, evidence-only, flagged for redesign):** Runtime's Load Session and Provably
  Fair's Verify silent no-ops (§ Cross-cutting findings); Certification's request-contract-layer `sampleCount`
  accepting non-positive/non-integer values (only caught later, at the domain layer, not rejected at the
  request boundary); Provably Fair's request-contract-layer `commitment` being entirely unchecked at Verify.
  None of these are changed by this baseline — they are documented so a redesign step must make an explicit,
  reviewable choice about each rather than inheriting them by accident.
