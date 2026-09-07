# PC-19 independent cold-start record

- Candidate: `169c80f839758285d02de55eb72008e750e48a53`
- Dependency lock digest (SHA-256): `755c40dc3a866cc206cd2548b151c1de8e96b102b4bee8aac5682ffaed1fef54`
- Installed package digest (SHA-256 of `node_modules/.package-lock.json`): `414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`
- Fresh rendered-run transcript digest (SHA-256): `2370764ca64557015fd830cf4fac1078deec2452aba2a0e70268f145e85825f9`

The reviewer began without reading source, roadmap, prior evidence, recovery history, or known findings. The candidate was built and Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open` and a new Studio/browser profile.

Observed public UI results from the fresh final run:

- The starter design rendered valid in every visible design section.
- One enabled `Create game` activation rendered its local checking state, then `Your game was saved. Opening its workspace…`, then the project workspace.
- The workspace rendered the overview, player entry (`Open Play`), Simulation, Replay, Game Model, and Build/Export surfaces. Game Model rendered its saved five-reel, three-row design; Build/Export rendered ready local destinations and an exact 1024-combination Outcome Library preflight.

No product defect was observed. This review is nevertheless incomplete: the public-launch cap was consumed while repairing the generic visible-UI driver, before the independent run could execute `Start Play`, `Run Simulation`, replay loading, Outcome Library generation, export, all six role missions, CLI/Studio parity, and examples-player parity. No pass or finding is claimed from this partial evidence.

## Recovery run 2026-09-07T18:12Z

The separately retained [recovery record](recovery-run-2026-09-07T18-12Z.md) extends the same candidate-bound review. It confirms the actual public Play action is labelled `New Play session`; `Start Play` is its rendered fieldset legend. The persistent harness has been repaired with that selector for the next fresh-profile run. No product terminal state or defect was observed in this bounded recovery launch.

The [18:35Z recovery record](recovery-run-2026-09-07T18-35Z.md) records a later fresh-profile run. It reached a completed Play round and a completed 10,000-round Simulation report, then stopped at the rendered Replay Session Spin choice because the browser driver could not locate its next activatable control. It did not report a product defect or claim remaining lifecycle/parity coverage.

Verifier-owned freeze receipt: `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-19-b7e657459f7cd688/pc-19-recovery-freeze-receipt.json` (SHA-256 `a4e102ec5bcfeadc8fd7be11a48d99e46a8bb9802a14f7400f084711a05a3775`). Its schema and candidate/package binding validated. The PC-19 protocol validator correctly refuses to mark the review complete because this partial record lacks the required complete `PROVENANCE.json` coverage bundle; no post-freeze comparison was opened.

The 18:35Z record has an independently validated verifier-owned freeze receipt. Its candidate/package binding anchors that bounded record's empty frozen finding set; no post-freeze comparison was opened. The receipt itself is intentionally not retained as repository evidence.

## Recovery run 2026-09-07T18:45Z

The separately retained [18:45Z recovery record](recovery-run-2026-09-07T18-45Z.md) covers four new fresh-profile candidate launches. It confirms rendered create, Play/spin, queued/running/completed Simulation, Session Spin replay loading, exact Outcome Library generation, and one successful TypeScript package build in the third launch. The fourth launch still could not reach the package-opening/fairness sequence because the harness's scoped `Build` lookup selected the visible `Build/Export` navigation control; it rendered no accepted package-build state or product error. The result remains driver-inconclusive and is not a product finding or PASS.

The recovery record retains no additional external receipt reference. No post-freeze comparison opened because the reviewer charter remains incomplete.

## Recovery run 2026-09-07T18:55Z–19:01Z

The [current-candidate delta record](recovery-run-2026-09-07T18-55Z.md)
completes the previously missing generated-sibling fairness and canonical-player
boundaries in fresh contexts. It is bound to candidate
`169c80f839758285d02de55eb72008e750e48a53` and installed-package digest
`414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`.
The historic material P2 (a Studio-generated sibling Outcome Library could not
be consumed by the opened TypeScript package's Provably Fair surface) received
an independently successful current-candidate delta: Compute commitments,
Generate round proof, and Verify completed against that sibling bundle. No
unresolved P0, P1, or material P2 was observed in this candidate-bound rerun.
The immutable protocol record remains pending an evidence-identity repair: its
validator requires the supplied installed-package digest to equal a retained
package-archive digest, while the controller supplied the lockfile digest.

## Recovery run 2026-09-07T19:27Z–19:33Z — completed immutable record

The verifier created and retained the exact candidate package archive
[`artifacts/pokie-1.3.0.tgz`](artifacts/pokie-1.3.0.tgz) before freezing it:
SHA-256 `50047c733bb2799f5dc22d44f4e276b4e174664a1aa975710596d90a3db11d37`
(3,163,590 bytes). The post-freeze delta used one new Studio profile and the
candidate source launcher; its local fairness terminals were Compute
commitments → Revealed round → Verified / No issues reported. The complete
review records validate with the repository's PC-19 validator.

Verifier-owned trusted receipt (outside this mutable evidence directory):
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-19-b7e657459f7cd688/pc-19-recovery-6-freeze-receipt.json`, SHA-256
`e2489c3dce7df93ac44a6b8e47b352dbd3f525f9f144c5feb1b8e3eda74cd671`.
