# PC-19 independent cold-start review — driver-inconclusive

Candidate code reviewed: `f02673948a8d4aba07ce42a2dd354be9a1f73447`.
This receipt is candidate-bound: the code-only diff from that commit is empty;
this evidence path is the only changed path. The original isolated blind launch
began before recovery disclosure and without product source, roadmap, known
findings, fixes, or previous evidence. It remains the pre-reading freeze receipt.

## Candidate and package receipt

This checkout was built and packed once during this recovery. The package is
`pokie-1.3.0.tgz`, SHA-256
`01205e69ea4b3a911fb56231a0ec8d54059e425eb38df5eea51573fd29b691a4`.
Its disposable installation reported `pokie --version` `1.3.0` and created
`Pc19 Delta` with `pokie create pc19-delta --random --seed 19 --out …`.
The resulting blueprint SHA-256 was
`7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`.
The tarball, installation, blueprint, isolated Studio registries and browser
profiles are not retained as evidence.

## Fresh rendered Studio recovery

Studio was launched from this source checkout only as
`node ./dist/cli/pokie.js --no-open`, once per fresh registry/profile.
The retained role journey rendered Game Model, Play, Simulation, Replay,
Build/Export and Overview. It accepted `New Play session`, rendered its local
player terminal (`Spin` and `Scenarios`), then returned through the remaining
roles.

The final fresh journey repaired the earlier out-of-viewport Build interaction:
the visible `TypeScript Game Package` card was locally `Status: Ready to build`;
its visible `Build` control was activated once; the same card then rendered
`Built to …/tsPackage.` and local `Open as Project` / `Open output folder`
controls. The generated package contained its README, package metadata, source
and `dist/index.js`; generated files are outside this evidence path. This is
the action-local accepted-to-terminal lifecycle, not a page-wide alert.

The separate saved-design Browse delta remains driver-inconclusive. A fresh
Studio page rendered `Load from path` with an enabled `Browse…` control. One
real focused pointer activation and, in a separate fresh profile, one native
Tab/Space activation each reached that exact rendered control. Neither
activation rendered a native picker window, a selected path, a pending/job
state, nor an action-local terminal. No path was typed and no `Load` action
was sent. This prevents proof that the disposable CLI-created blueprint opens
through Studio's saved-design picker; it is not an action-correlated product
failure.

No P0, P1 or material P2 product-coherence defect was observed. No PASS is
issued: saved-design Browse selection and the resulting CLI/Studio artifact
interoperability branch remain unreached. This recovery delta is intentionally
only the concise receipt; it adds no raw logs, browser artifacts, generated
outputs or automation source.
