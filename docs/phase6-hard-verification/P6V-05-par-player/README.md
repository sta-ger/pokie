# P6V-05 independent host verification — inconclusive

Candidate content: `49d5fccc517f5a7f964ecc7fa32148edeb18d588` (this evidence checkout is its README-only descendant).  `npm run build` completed successfully before the browser work.

The public Studio command was launched from this checkout as required:

```text
node ./dist/cli/pokie.js --no-open
```

The first fresh-profile attempt reached the server but the harness used a non-hash client URL (`/home/design`); Studio rendered its normal 404 response, not a product error.  The persistent harness was repaired in place to use `/#/home/design`.

On the second and final permitted fresh-profile launch, the visible Studio UI saved the default Recommended model to:

```text
/tmp/p6v05-launch1-ZLuSft/profile/POKIE Projects/starter-slot/blueprint.json
sha256 9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031
```

It then opened the saved workspace and completed one Studio Play round.  Rendered evidence included `Round complete — no win this round.`, the 5×3 symbol screen, paylines 0–2, `Bet: 1125`, and the paytable.  The fixture reserved for the native-picker PAR round trip was unchanged:

```text
examples/parsheets/starter.par.xlsx
sha256 a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
```

The visible Simulation tab rendered its `Rounds` control (default `10000`) and `Run Simulation` button.  The harness could not re-resolve that rendered input by its label after tab navigation, and the second-launch cap prevented repair/retry.  No rendered product error or reproducible product symptom was observed.  Consequently the native-picker PAR import/export/re-import, managed canonical semantic comparison, Replay, outcome generation, Stake export, and the exact `pokie-examples` parity matrix were not reached.  No companion workspace was supplied in the persisted request, so an exact second repository SHA could not be bound.

No generated profiles, worktrees, screenshots, raw logs, or harness files are included in this evidence commit.

## Recovery attempt (native PAR picker)

Candidate product source remained exactly `49d5fccc517f5a7f964ecc7fa32148edeb18d588`; this evidence-only descendant is `5bb883229c008bd7fc8133343a8c7ac28e8a10fe` before the present record.  The retained fixture remains:

```text
examples/parsheets/starter.par.xlsx
sha256 a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
```

On 2026-08-23 the persistent candidate-source harness was repaired in place to bind `Browse…` to the rendered `PAR sheet path` control by its local geometry, then launched fresh with:

```text
node ./dist/cli/pokie.js --no-open
```

The visible Design Game page opened its advanced PAR panel.  The physical `Browse…` action was issued for the fixture, but no native picker window, rendered fallback picker, local pending state, or rendered product error appeared within the bounded semantic wait.  A single safe retry after repairing the prior over-broad Browse binding produced the same unconfirmed interaction.  No product symptom was rendered, so this is driver-inconclusive rather than a product finding.  The import/export/re-import path and canonical comparison were not reached; generated runtime directories, screenshots, and logs are not committed.

The required exact `pokie-examples` companion checkout was still absent from the persisted request, so the package/client/dev/Replay parity matrix and the second recorded SHA cannot be independently verified.

## Focused harness recovery (2026-08-23)

The candidate source was rebuilt successfully, and the fixture was rechecked before the fresh Studio work:

```text
candidate product SHA 49d5fccc517f5a7f964ecc7fa32148edeb18d588
examples/parsheets/starter.par.xlsx
sha256 a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
```

The persistent harness at the controller-supplied workspace was repaired in place for all four permitted fresh-profile launches.  It now scopes `Browse…` to the rendered `PAR sheet path` control, sends a complete visible mouse transition, discovers Zenity/KDialog by X11 window/PID rather than a localised title, and activates plus verifies a native dialog before typing.  The last attempt confirmed that its target was the rendered `Browse…` button next to `PAR sheet path`; nevertheless the control produced neither a native dialog, the rendered server-filesystem fallback, a local pending/error state, nor an `/api/home/fs/native-browse` resource request.  Only the normal initial blueprint validation request appeared.  The control's visible state contained no product error.

This is therefore driver-inconclusive, not a product finding: the real native-picker selection was never accepted, so neither the physical import/export/re-import nor canonical semantic comparison could begin.  No screenshot, raw log, runtime/profile, generated workbook, or harness script is retained in this evidence.  The exact `pokie-examples` companion workspace remains absent, so its required SHA and full cross-repository parity matrix remain not reached.

## Final focused recovery (2026-08-23)

The retained fixture remains `examples/parsheets/starter.par.xlsx` with SHA-256 `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`; product content remains exactly candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`.  Four fresh, isolated candidate-source Studio launches used `node ./dist/cli/pokie.js --no-open` and one persistent repaired harness.  The repair first scoped the control to the visible `PAR Sheet Import / Export` fieldset, required the actual local button under the pointer, then used a real X11 click in the confirmed active Chrome window.  On the final launch, the rendered local `Browse…` button received focus and one safe keyboard retry after the initial idempotent click emitted neither a native-picker window, `/api/home/fs/native-browse` resource, server-filesystem fallback, local pending state, nor rendered error.  The bounded wait therefore remains driver-inconclusive rather than a product defect.  No generated runtime data, screenshots, logs, or harness files are committed.  No companion workspace/SHA was supplied, so cross-repository parity remains not reached.

## Host-side follow-up (2026-08-23)

The candidate was rebuilt successfully from the candidate-content descendant (only this evidence README differs from `49d5fccc517f5a7f964ecc7fa32148edeb18d588`).  The fixture SHA-256 remains `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.

The controller-supplied companion checkout is now present, clean, read-only, and exactly `b7b043e0e722da917f1b60c4f107c8cc35fdd725`.  It was not previously available to the retained run; its parity matrix was not exercised in this follow-up because the physical PAR workflow remained blocked before a managed model could be produced.

The persistent harness was repaired to bind browser input to its own active CDP target rather than an arbitrary same-titled Chrome window.  One fresh run then opened the real native picker and selected the physical fixture through the activated host dialog, proving that repaired transition.  It stopped at a harness-only native-label query (the rendered control is associated by `<label>`, not `aria-label`).  The final allowed fresh run repaired that query but the same visibly rendered local `Browse…` action emitted no picker, fallback, pending state, request, or product error after one safe retry.  Thus import, edit/save, export/re-import, semantic comparison, and cross-repository parity remain not reached.  No generated files or raw diagnostics are retained.

## Focused recovery closeout (2026-08-23)

Product content remains candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`; fixture `examples/parsheets/starter.par.xlsx` remains SHA-256 `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.  Four isolated candidate-source launches of `node ./dist/cli/pokie.js --no-open` used the repaired persistent harness and fresh profiles.  The final rendered journey activated the native picker, selected the fixture, showed `Imported with warnings` with PAR provenance, displayed canonical preview hash `ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`, applied the import through its visible confirmation, and edited the managed model.

It then stopped at the separate rendered `Save to path` picker because the recovery harness still scoped its Browse lookup to the PAR fieldset.  This was a driver failure, not a rendered product symptom; no further launch is allowed.  The required save/export/re-import semantic comparison and the dependent exact-companion parity matrix remain not reached.  The companion checkout was independently clean and exact at `b7b043e0e722da917f1b60c4f107c8cc35fdd725`.  No runtime directories, browser profiles, screenshots, raw logs, workbooks, or harness files are committed.

## Selector-recovery follow-up (2026-08-23)

Content remains bound to product candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`; the exact clean, read-only companion remains `b7b043e0e722da917f1b60c4f107c8cc35fdd725`.  Four further isolated candidate-source Studio launches used the controller-supplied persistent harness and exactly `node ./dist/cli/pokie.js --no-open`.

The fourth journey opened the real native file picker, selected the fixture, rendered `Imported with warnings`, PAR provenance and canonical preview hash `ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`, applied it, saved a managed Blueprint through a real native Save picker, and exported a new physical XLSX through a real native Save picker.  The generated files remain only in the isolated runtime; their SHA-256 digests were:

```text
starter.par.xlsx       a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924
saved blueprint        9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031
exported workbook      b6e87b2d8da54b14dd087acf490f2d0d7e0ee484f6cc49b45a5efcf6a9a9a08b
```

The harness did not semantically confirm its attempted name edit before saving, and it then failed to locate the Stepper's `Import` control because it required exact button text while the rendered accessible name includes its description.  It therefore neither re-imported the export nor compared the canonical model, and it did not start the dependent companion/package/client/Studio-Play/Replay parity matrix.  This is a selector/driver limitation with no displayed product error or mismatch, not a product finding.  No generated runtime data, browser profile, workbook, raw log, screenshot, or harness source is retained in the evidence commit.

## Focused recovery rerun (2026-08-23)

The source checkout remains a README-only descendant of product candidate `49d5fccc517f5a7f964ecc7fa32148edeb18d588`; every Studio invocation used its candidate build exclusively as `node ./dist/cli/pokie.js --no-open`.  The required read-only companion checkout was again clean at `b7b043e0e722da917f1b60c4f107c8cc35fdd725`; fixture `examples/parsheets/starter.par.xlsx` remains SHA-256 `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.

After repairing the persistent controller-supplied harness to select Stepper actions by semantic prefix and to bind labelled controls locally, four isolated Studio/profile launches were used.  Fresh rendered journeys repeatedly selected the physical workbook through the real activated native picker and showed `Imported with warnings`, PAR provenance, the canonical preview hash `ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`, and successful Apply into the managed Blueprint editor.  Subsequent harness-only focus/click acceptance was intermittent: the visible `Game name` field did not become the active input in two attempts, and the final repaired Browse binding did not report focus, picker, fallback, pending state, request, or rendered error.  No rendered product failure or canonical mismatch was observed.  The launch limit therefore prevented the required physical save/export/re-import comparison and its dependent package/client/Studio-Play/Replay parity matrix.  This is driver-inconclusive; no runtime data, browser profiles, workbooks, raw logs, screenshots, or harness source are retained.
