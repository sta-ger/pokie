# P6V-05 independent host verification — driver inconclusive

Product candidate: `caf8132177b23abc34096c6c3ce4079330b34080`.
Read-only companion candidate, clean before and after: `1e2c8c00457f3af389c0168432c08e63ca441465`.

The candidate Studio client was already built. Every one of the four permitted fresh
Studio profiles used this checkout command exactly:

```text
node ./dist/cli/pokie.js --no-open
```

The stable persistent harness was repaired in place for the host's Zenity 4/Xvfb
renderer (scoped `GSK_RENDERER=cairo`) and to scroll each rendered control into view
before acting. It drove the real native picker with its active native window verified
before entering the absolute source path. The final rendered journey established:

1. Picker selection rendered the exact source XLSX in Studio's labelled **Location** field:
   `examples/parsheets/starter.par.xlsx` — SHA-256
   `a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`.
2. **Detect** rendered **This is a PAR sheet workbook**. **Open in Design Game** then
   rendered **Imported with warnings**, the source provenance, and two displayed
   weighting/pay diagnostics.
3. **Preview canonical model** rendered **Preview only**, a valid 3x3 / 4-symbol
   `PAR Sheet Starter` model, canonical preview hash
   `sha256:ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`,
   and its planned package destination.
4. **Continue to Apply / Export** → **Apply** → rendered confirmation → **Confirm**
   was accepted; **Game basics** rendered for the applied model. No product error
   rendered at any reached surface.

The fourth and final permitted fresh launch ended when the harness tried to edit the
now off-screen **Game name** input before its scroll repair was added. This is a
driver interaction failure, not a rendered/reproducible product symptom. Launch quota
was exhausted, so save, physical export, reimport/semantic comparison, and the
dependent exact-SHA companion/package/Studio Play/public client-dev/Studio Replay/CLI
Replay parity matrix were not run. No generated project, workbook, profile, log,
screenshot, or harness is committed; this concise transcript is the complete evidence
delta.
