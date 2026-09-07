# PC-19 independent cold-start review — driver-inconclusive

Candidate code reviewed: `f02673948a8d4aba07ce42a2dd354be9a1f73447`.
The review commit is evidence-only: `git diff --name-status` from that candidate
to the review parent lists this README alone. The original isolated blind launch
and external freeze receipt remain the candidate-bound record: it began before
this recovery disclosure and without product source, roadmap, known findings,
fixes, or prior evidence.

## Candidate and artifact receipt

The candidate checkout was built once, then packed as `pokie-1.3.0.tgz`:

- package SHA-256: `01205e69ea4b3a911fb56231a0ec8d54059e425eb38df5eea51573fd29b691a4`
- disposable installed CLI: `pokie --version` = `1.3.0`
- installed CLI command: `pokie create pc19-delta --random --seed 19 --out …`
- resulting validated blueprint SHA-256:
  `7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`

The tarball, installed package, blueprint, Studio registries, browser profiles,
raw transcripts, screenshots, and any generated project outputs are outside
this evidence path and were not retained.

## Fresh Studio journeys

Four fresh registries and browser profiles launched Studio only through
`node ./dist/cli/pokie.js --no-open` from this checkout.

1. The saved-design delta opened `Show advanced options`, reached the enabled
   `Load from path` `Browse…` control, and activated it once. The first launch
   used a repaired trusted pointer event; the second additionally activated and
   verified Chromium's native window before that event. No native picker window
   rendered in either attempt, and there was no action-local success, pending
   job, error, or terminal state. The required focus-verified path entry,
   `Load`, and CLI-created-blueprint Studio selection therefore remain driver
   inconclusive, not a product finding. The action was not retried again.
2. A separate fresh workspace journey created `Starter Slot` and rendered the
   local Game Model, Play, Simulation, Replay, Build/Export, and Overview role
   surfaces. The first pass inspected the actual Play control name rather than
   assuming one: the rendered control was `New Play session`.
3. The final fresh journey activated `Create game` once and observed its local
   Overview workspace terminal. It activated `New Play session` once, rendered
   the local pending `Starting…` state, and then the player controls `Spin` and
   `Scenarios`. It also rendered Game Model, Simulation, Replay, Build/Export,
   and returned to Overview. No local product error was rendered.
4. In that same last journey the visible TypeScript Game Package card showed
   `Status: Ready to build`. Its `Build` control was below the active viewport;
   the driver supplied an out-of-viewport coordinate, so no accepted lifecycle
   record or local terminal state was observed. It is a driver interaction
   limitation, not an action-correlated product failure, and no duplicate Build
   was sent.

No P0, P1, or material P2 product-coherence defect was observed. This is not a
PASS: saved-design file selection, the resulting artifact-interoperability
journey, and a confirmed Build terminal still require a new bounded recovery
run. The completed role and player observations do not fill those gaps.

## Charter result

The retained blind receipt satisfies the independent pre-reading boundary. The
current-candidate pack/install receipt and fresh Studio work cover creation,
the six workspace role surfaces, and a real player session. The full charter
is not complete because the saved-design Browse delta cannot be correlated to a
native picker/Load terminal, and the TypeScript package Build action has no
accepted or terminal lifecycle record. No page-wide message or fixed wait was
treated as an action result.
