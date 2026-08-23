# P6V-05 independent host verification — driver inconclusive

Product candidate verified before launch: `caf8132177b23abc34096c6c3ce4079330b34080`.
Read-only companion verified clean before and after: `1e2c8c00457f3af389c0168432c08e63ca441465`.

The persisted harness was repaired in place and every fresh Studio invocation used the candidate
checkout command exactly:

```text
node ./dist/cli/pokie.js --no-open
```

All Studio registries and Chrome profiles were fresh and isolated. The physical input was
`examples/parsheets/starter.par.xlsx` (SHA-256
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`).

## Rendered recovery transcript

1. The repaired GTK flow activated the real native picker, verified it as the active window,
   entered the absolute workbook path, resolved that native location, and issued one confirmation.
   Studio then rendered the selected path in the labelled **Location** input, **This is a PAR sheet
   workbook**, **Imported with warnings**, and **Preview only** for the canonical model.
2. The harness clicked **Continue to Apply / Export**, then attempted to find the locally rendered
   **Apply** control too early. This is a selector/transition error, not a rendered product error.
3. The stable harness was repaired to wait for **Apply imported blueprint**. On each of the two final
   fresh profiles, the real picker stayed open after the same entered location and one allowed
   confirmation; no Studio selection, local error, retry affordance, or other rendered product symptom
   appeared. The 30-second interaction bound therefore remains driver-inconclusive.

No generated workbooks, managed projects, browser profiles, raw logs, screenshots, or automation are
committed. Since a physical import could not be carried through Apply/save/export/reimport on the final
bounded run, the deterministic companion/package/Studio Play/client-dev/Replay/CLI Replay parity matrix
was not started. This document is the sole evidence delta.
