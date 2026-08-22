# P6V-03 focused host recovery — driver inconclusive

Candidate: `a87e90d8ced5febdccd6979915c9b35a66795f7d` (an ancestor of this
evidence commit). The retained screenshot checksums remain
`645918afbbc2240ac3b8b427736848ea5cc81246137e179861e05cacd71c9273`
and `b80794689b1bf62d3fd5e5fcdf72b6ce32587c6d659d80bf1815c2fa88847150`.

`npm run build-cli` passed. One repaired stable harness used fresh HOME/XDG
registries and visible Chrome profiles; every Studio start was exactly
`node ./dist/cli/pokie.js --no-open`. It repaired the retained input, native
picker, literal-control, and chooser-state causes. Its final fresh rendered
run reached `New Blueprint` → `Recommended`, but the Game id's displayed value
did not attain the requested value after the single safe idempotent rendered
entry attempt. No Create Project request, downstream operation, or rendered
Studio/product error occurred. The remaining Recommended modelling and
Random/Blank/persistence work is therefore driver-inconclusive, not a product
finding. Temporary profiles, registries, automation, logs, and generated
output were removed.
