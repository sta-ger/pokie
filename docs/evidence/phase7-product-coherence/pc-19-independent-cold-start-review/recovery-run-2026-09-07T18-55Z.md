# PC-19 current-candidate fairness and player delta — 2026-09-07T18:55Z–19:01Z

- Candidate source: `169c80f839758285d02de55eb72008e750e48a53`
- Evidence descendant at start: `897a497d6158255794ae99ccb2e48ce82d7dc863`
- Installed package digest (`node_modules/.package-lock.json`, SHA-256): `414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`
- Source launcher: `node ./dist/cli/pokie.js --no-open`
- Fresh Studio context: `run-2026-09-07T18-55-16-039Z/studio-home` and its fresh Chromium profile, outside this evidence directory
- Fresh canonical-player context: `run-2026-09-07T19-01-34-224Z/studio-home` and its fresh Chromium profile, outside this evidence directory
- Studio transcript SHA-256: `aadbd7f0fe2d7a5e21e92dcdd8a8881c135fda5691187860c97901c696fae5d2`
- Player transcript SHA-256: `f8daaca97f60915ee6c1986890574c70ecea227a22a44a68192577fdd658b06f`

## Fresh rendered Studio journey

| Role / boundary | Ready → one visible action → local rendered result |
| --- | --- |
| Designer | Valid starter design → **Create game** → saved workspace. |
| Player | **New Play session** → **Spin** → `Round complete`, a visible winning grid, and credits update. |
| Analyst | **Run Simulation** → queued then running → completed 10,000-round report; **Open full report** exposed its details. |
| Replay inspector | **Session Spin** selection → timestamped `Session 1 — Round 1` → local round details. |
| Publisher / artifact integrator | **Generate exact outcome library** → `Generated 1,024 outcomes … into outcomelibrary`; card-local **Build** → `Built to …/tsPackage`; **Open as Project** → read-only playable package. |
| Fairness verifier | Generated sibling `../outcomelibrary`, `base`, and fresh seeds → **Compute commitments** → server and full commitments; **Generate round proof** → `Revealed round`; **Verify** → `Verified` / `No issues reported.` |

The final row is the independent delta rerun of historical P2
`pc-19-generated-sibling-bundle`: on pre-fix candidate `1229e9d965c5d94aa2f6751e646090ed1a6f66cb`, the generated sibling was selected but **Compute commitments** rendered its own immediate failure. In this current-candidate run, the exact first-party generated sibling reached all three promised fairness terminals without retrying a pending operation.

## Public CLI / Studio parity spot check

The candidate-built public CLI inspected the Studio-produced `tsPackage` as a runnable game package, inspected the sibling as an Outcome Library, and validated the package with `valid yes`. Its public `sample` of that library reported the same `starter-slot-base` identity and library hash `sha256:f30acec36101c92da8bf15c9ddc81d27c4c2a33b8816eee629e888009a7abc5e` that Studio displayed during commitments. This confirms the artifact boundary is consumable on both public surfaces.

## Canonical player visual parity

The public candidate launcher `node ./dist/cli/pokie.js dev <Studio-built-tsPackage> --no-open` opened the canonical player in a new Chromium profile. Its visible **Start new session** action changed the rendered session ID. The following one **Spin** action first disabled its own control (accepted pending state), then re-enabled it with the settled grid and credits `1000` → `999`; no `Retry spin` recovery surface remained. This is a rendered player result, not an API assertion.

## Frozen disposition and evidence boundary

No new product finding was observed. The historical P2 is independently delta-disposed as fixed by the rendered current-candidate workflow. The attempted freeze record was rejected before comparison: the controller-supplied installed-package digest is not the SHA-256 of the required retained package archive. No digest was substituted. The invalid external receipt reference has been pruned from this retained evidence; a future verifier must create and retain the exact package archive, bind its SHA-256 consistently in new metadata and a new verifier-owned receipt, validate that record, and then open post-freeze comparison.
