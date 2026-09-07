# PC-19 recovery run — 2026-09-07T18:45Z

- Candidate source: `169c80f839758285d02de55eb72008e750e48a53`
- Candidate evidence descendant: `ac45979e3f8a6a8d25f1dc0a3387a79a0444adfc` (the candidate is its ancestor; intervening changes are PC-19 evidence only)
- Installed package digest: `414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`
- Public launcher: `node ./dist/cli/pokie.js --no-open`
- Fresh contexts: four new `POKIE_STUDIO_HOME` directories and Chromium profiles below the verifier-owned harness workspace
- Final launch transcript SHA-256: `ae5f6a31ff61d5e25139aa5f9eb2f7d995df25f3e108d67a1ea040e3f81b0790`

## Rendered results

1. Every launch used the candidate-built public Studio launcher and one fresh profile. Each rendered the starter design, accepted one `Create game` activation, and reached that workspace.
2. Each reachable journey rendered `New Play session`, a completed `Spin`, a queued then running then completed 10,000-round Simulation, `Open full report`, Replay `Session Spin`, and its timestamped saved-round control. The third and fourth launches rendered the selected round's local details.
3. Exact Outcome Library generation rendered `Generated 1,024 outcomes for mode "base" using exact` in the final two journeys. The third journey then activated the card-local TypeScript package `Build` and rendered `Built to …/tsPackage` plus `Open as Project`; this is a durable public-workflow success.
4. The second journey's first package-build attempt was off viewport, so it rendered no accepted state; the control was repaired to scroll into view. The third journey then proved the build. Its following `Open as Project` lookup was filtered out by a local scope implementation. The fourth attempt repaired that scope but the prefix lookup then selected `Build/Export` navigation instead of the card-local exact `Build`; the card-local package Build remained ready and no package request, pending state, terminal success, or local error was rendered from that activation.

No product failure is claimed: the only unfinished boundary is a driver action-correlation failure. The four-launch budget is exhausted before opening the generated sibling bundle and completing Compute commitments, Generate round proof, and Verify. Six-role missions, CLI/Studio parity, and Studio/examples-player parity likewise remain not reached. No post-freeze comparison was opened.

## Frozen finding set

The frozen finding set is empty. This bounded recovery record retains no external receipt reference.

Raw profiles, project/output trees, screenshots, and the full transcript remain outside repository evidence. This record retains only the candidate binding and transcript checksum.
