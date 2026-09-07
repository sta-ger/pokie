# PC-19 blind cold-start transcript (partial)

Candidate reviewed: `7e4bf7cd1178fe59a29f924bb72e92b379b6d444`.

The candidate build completed successfully before the Studio launch. The built
CLI checksum was `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`.

The fresh-profile public run launched exactly:

```
node ./dist/cli/pokie.js --no-open
```

Rendered workflow evidence from that run:

1. The visible, enabled **Create game** button was activated once from the
   starter design.
2. Its local accepted state rendered: **Save game — Your game was saved.
   Opening its workspace…**.
3. The local terminal surface rendered the **Starter Slot** workspace with
   Overview, Game Model, Play, Simulation, Replay, and Build/Export, and
   showed **Valid — no issues found**.
4. After the visible **Close project** action, the Projects surface rendered
   one available **Starter Slot** project with the action **Open**.

No product failure was observed in this executed path. This is intentionally
partial: the four-launch blind-run limit was reached while repairing the
generic harness, before all six role missions, artifact interoperability,
parity spot checks, player review, packed-artifact receipt, and external freeze
receipt could be completed. Therefore it is not pass evidence.

The three retained browser screenshots are deliberately not copied into the
repository; their source-run checksums are, respectively, initial/workspace/
projects:

```
7b40cd1848ac2e3365e6341c8b2a3a0dc4377dd196cbf92453234d56d7b8bd2d
5945d9ac8779fc400fb1d1896190840cb72857e60233c510c8150f60ca59a896
3b5bbc483900cb0e74031217af99931129b62617d8c20e88aa85f3945ac7d22e
```

## Recovery receipt: 2026-09-07

The exact-candidate source is still the parent `7e4bf7cd1178fe59a29f924bb72e92b379b6d444`; this evidence-only checkout is its descendant. A clean rebuild produced CLI SHA-256 `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`, and `npm pack --ignore-scripts` produced `pokie-1.3.0.tgz` SHA-256 `471f04ec2990e472762f446118e61112c510a2d82adfbaf2a7cc6ed8a4edb514`.

Four fresh Studio attempts used exactly `node ./dist/cli/pokie.js --no-open`, each with a new Studio registry and Chromium profile. The repaired persistent harness created a candidate blueprint through the public CLI, reached the visible advanced **Browse** and **Load from path** workflow, and attempted to enter the generated absolute path through the rendered control. The native chooser was never exposed after the enabled Browse activation, despite active-window verification. The fallback focused a rendered path field but could not correlate the following visible Load activation with a selected-design terminal state. No action-local rendered error or product defect was observed. This is a driver-inconclusive recovery result, not pass evidence and not a product finding. The transient run profiles, artifacts, screenshots, and full driver transcripts remain outside the retained evidence payload.

## Recovery continuation: 2026-09-07

The candidate source remains the parent
`7e4bf7cd1178fe59a29f924bb72e92b379b6d444`; the current checkout differs
from it only in this evidence README. Its existing `dist/cli/pokie.js` has
SHA-256 `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`.

Four additional fresh-profile public Studio launches again used exactly
`node ./dist/cli/pokie.js --no-open`. The persistent harness repaired the
earlier host-dialog assumption: the enabled rendered **Browse…** control
accepted the action by opening Studio's own rendered *Server filesystem
browser*. It navigated visibly through `Work` → `sta-ger` → `agents` →
`runtime`. The next directory listing remained in its own rendered `Loading
directory…` state and did not expose the required next entry within the
bounded observation. A second isolated path beneath the candidate worktree
reached the same local directory-browser lifecycle and likewise did not
render its next expected folder before the bound. No visible action-local
error, Save success claim, generated job, or terminal product error was
rendered; therefore these are driver-inconclusive observations, not product
findings. The final raw transcript was discarded after recording SHA-256
`87723896e8035f04269c1d8900f64523e5bc2354d058f9017fe90377ca4b631a`.

For the package binding, `npm pack --ignore-scripts` produced an isolated
`pokie-1.3.0.tgz` with SHA-256
`471f04ec2990e472762f446118e61112c510a2d82adfbaf2a7cc6ed8a4edb514`.
That tarball installed into an isolated harness prefix with
`npm install --ignore-scripts`; its installed `dist/cli/pokie.js --help`
rendered the public command list. The tarball, install tree, profiles,
temporary candidate blueprint, screenshots, and raw logs were not retained.

This continuation cannot complete the saved-design Browse → Load → Save →
durable Projects delta, the remaining role/lifecycle matrix, or the required
independent full-charter evidence before the four-launch allowance is
exhausted. PC-19 consequently remains **inconclusive (driver)**; it does not
claim a product defect or a PASS.
