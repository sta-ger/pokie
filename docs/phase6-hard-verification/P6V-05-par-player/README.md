# P6V-05 host verification — finding (native picker does not reflect selection)

Product candidate SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
Companion candidate SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
This checkout is an evidence-only descendant of the product candidate (source diff: this README
only); the read-only companion checkout was clean and exactly at its recorded SHA before and after
the run.

The candidate Studio bundle was freshly built, then Studio was launched from this source checkout as
`node ./dist/cli/pokie.js --no-open` on four isolated registry/browser profiles. The final launch used
the controller-assigned persistent harness after repairing its recorded picker driver failures.

## Observed native-picker defect

The rendered Studio workflow reached **Design Game** → **Show advanced options** → **PAR sheet
path** → **Browse…**. The real top-level Zenity picker was activated, confirmed as the active window,
and given the physical `starter.par.xlsx` fixture with Enter. The browser's request for that rendered
action completed with:

```json
{"status":"selected","path":"…/starter.par.xlsx"}
```

Yet Studio's directly queried, rendered **PAR sheet path** input remained the empty string. This is a
reproducible product mismatch between an acknowledged native selection and the visible field; it is
not a readiness timeout. The source fixture SHA-256 was
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.

To continue reachable inspection without retrying the native action, the same fixture path was entered
through the visible field. Studio then rendered **Imported with warnings**, the provenance/hash
diagnostic, and a valid canonical model (the two retained warnings are the starter sheet's
weighting/paytable warnings). **Apply** was rendered and activated, but no local success or error state
appeared before the bounded interaction limit; no later rendered observation established the apply.

Consequently, managed Blueprint save, physical export/reimport and semantic/hash comparison, Studio
Play/Replay, companion `npm start`, public client/dev, and CLI Replay were not reached. No Player
parity or browser Node-builtin/module-createRequire result is claimed. The native-picker failure remains
unfixed, so the full exact-SHA parity matrix cannot pass.

No generated project/output tree, runtime profile, harness source, raw log, screenshot, PID, symlink,
or copied workbook is retained in this evidence directory.
