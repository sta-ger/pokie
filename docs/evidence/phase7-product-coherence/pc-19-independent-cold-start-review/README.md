# PC-19 independent blind cold-start review

Candidate: `1229e9d965c5d94aa2f6751e646090ed1a6f66cb`

Review run: 2026-09-07T17:15Z–17:28Z UTC
Context: fresh Studio registry and fresh Chromium profile; Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open`.

## Result

Finding: the built package's **Provably Fair** workflow cannot complete the
outcome-library folder that Studio itself generated. This is a material P2
product-coherence failure: a first-party generated artifact is not consumable
by the first-party verification surface that explicitly requests it.

The retained transcript records only rendered public-UI observations. No
repository source, roadmap, prior evidence, recovery history, or known finding
was read before the run and its finding were recorded.

## Compact artifact binding

| Object | Rendered source/result | SHA-256 |
| --- | --- | --- |
| Editable Blueprint | created in Studio at `starter-slot-263/blueprint.json` | `9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031` |
| TypeScript package | Build/Export reported `Built to .../tsPackage`; then **Open as Project** opened it read-only | `947f7483afe017aae48c154f00c67e4705b09e5ab972cca3d3f277e562dabc2a` |
| Outcome library | generator reported `Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%) into outcomelibrary` | consumed attempt failed below |

## Finding correlation

- Ready state: the opened TypeScript package rendered **Provably Fair** with
  all required inputs filled: source directory
  `/home/stager/POKIE Projects/starter-slot-263/outcomelibrary`, mode `base`,
  server seed `server-seed`, client seed `client-seed`, and nonce `0`.
- One visible activation: **Compute commitments**.
- Accepted lifecycle: none was rendered; this action exposed no queued/job id.
- Action-local terminal: **“The Provably Fair bundle directory could not be
  completed. Try again. If it continues, choose the location again and retry.”**
- The action was not repeated.
