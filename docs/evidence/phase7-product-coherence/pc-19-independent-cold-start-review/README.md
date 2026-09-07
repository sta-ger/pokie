# PC-19 independent cold-start review — driver-inconclusive

Candidate code reviewed: `f02673948a8d4aba07ce42a2dd354be9a1f73447`.
The code-only diff from that candidate to this evidence descendant is empty.
The original isolated blind launch began before the recovery disclosure and
without source, roadmap, known findings, fixes, or prior acceptance evidence;
the retained `blind-generation-*.md` records remain its pre-reading freeze
receipt.

## Candidate and package receipt

The candidate was built and packed once in the retained clean run as
`pokie-1.3.0.tgz`, SHA-256
`01205e69ea4b3a911fb56231a0ec8d54059e425eb38df5eea51573fd29b691a4`.
Its disposable installation reported `pokie --version` `1.3.0`. The current
candidate CLI also created `Pc19 Delta` with
`node ./dist/cli/pokie.js create pc19-delta --random --seed 19 --out …`; the
resulting blueprint SHA-256 was
`7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`.
Tarballs, installations, generated blueprints, isolated registries, profiles
and raw logs are deliberately not retained here.

## Fresh rendered Studio recovery

Studio was launched only as `node ./dist/cli/pokie.js --no-open`, once per
fresh registry/profile. The retained role journey rendered Game Model, Play,
Simulation, Replay, Build/Export and Overview. It accepted `New Play session`
and rendered its local player terminal (`Spin` and `Scenarios`).

The final fresh journey repaired the earlier out-of-viewport Build interaction:
the visible `TypeScript Game Package` card was locally `Status: Ready to build`;
its visible `Build` control was activated once; the same card then rendered
`Built to …/tsPackage.` and local `Open as Project` / `Open output folder`
controls. The generated package contained its README, metadata, source and
`dist/index.js`. Representative visual receipts are
`generation-5/package-open.png` and `generation-5/build-export.png`; generated
output itself is not retained. This is an action-local lifecycle, not a
page-wide alert.

The saved-design Browse delta was extended in fresh candidate profiles. `Show
advanced options` exposed the enabled `Load from path` `Browse…` control. A
real pointer activation alone left that exact control enabled with no
pending/picker state. The one safe idempotent retry focused the rendered control
by Tab and activated it with Space; it rendered an accepted disabled state and
then the honestly-labelled server-filesystem-browser fallback. Selecting the
CLI-created `cli-created-blueprint.json` in that rendered fallback put its
absolute path in the exact Load field. One visible `Load` then changed the
primary action from `Create game` to `Save game`, establishing that Studio had
loaded the selected artifact.

One visible `Save game` activation consistently rendered its local message
`Your game was saved. Opening its workspace…`. For the full bounded
observation, it did not render the promised workspace or an action-local error.
Continuing from this local success through visible `Projects` rendered `No games
yet`, so no saved-design card existed to activate. No second Save was sent. The
same behavior reproduced in fresh profiles.

This is not a product finding: the Save operation exposed neither a
created/queued job id nor its own immediate terminal failure. Under the
action-correlation contract, the missing terminal is driver-inconclusive rather
than a P0/P1/P2 claim. It blocks only the final saved-design workspace and
post-load player/role journey; the candidate-bound retained role, player, build
and visual evidence remains truthful.

No P0, P1 or material P2 product-coherence defect is recorded. No PASS is
issued while this branch remains inconclusive. This concise receipt adds no raw
browser artifacts, generated output or automation source; those remain in the
uncommitted verifier runtime workspace.
