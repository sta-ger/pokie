# PC-20 current-candidate exact-generation rerun

Candidate `63e57457ef5c9da5595479197c76e7669c6192ef` was built in this
checkout before the fresh workflow reruns. The retained candidate archive is
`artifacts/pokie-1.3.0.tgz`, SHA-256
`d497c44fc25174aafeba8d5c3d44b879c22a7518c21209be9218a7b79ca3daf1`
(3,211,635 bytes). The validated verifier-owned freeze receipt remains at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-e3fea3bb3f7e68c2/pc-20-freeze-receipt.json`,
SHA-256 `0819365adabb9d471ce62dfeaf5e589688fdda546fad34bcf300714c0c5faf75`.

In each of two fresh-profile recovery launches, the candidate-built public CLI
(`node ./dist/cli/pokie.js`) built the external 1,000,000-combination package;
one SIGINT after its own `progress 5000 / 1000000` record exited 130, retained
only the checkpoint (no destination or staging), and one `generate --resume`
then exited 0, published the library, consumed that checkpoint, and left no
staging.

Each Studio launch used exactly `node ./dist/cli/pokie.js --no-open`. It
rendered the Studio home and enabled `Show advanced options (file and JSON
tools)`. The first launch sent ordinary rendered CDP character events to the
visible `Load from path` field; the second repaired run activated the single
visible `POKIE Studio` Xvfb window, verified it active, and used its real
keyboard. In both cases the controlled field's own rendered value remained
empty. The harness therefore did **not** activate `Load`, so no Studio request,
generation job, cancellation, or terminal product state can be correlated to
this launch. This is driver-inconclusive rather than a product finding; no
P0/P1/material-P2 defect was observed in the reachable CLI or Studio state.

The unretained bounded transcript for the final recovery launch has SHA-256
`54ab34938c52b453d0f69b40ed319c9cc48474aa56ec80483c0c48be5eaace5a` at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-e3fea3bb3f7e68c2/current-candidate-run/transcript.md`.
No generated project, browser profile, screenshots, or raw logs were retained
in the repository.
