# Saved-design Browse/Save delta transcript

- Candidate: `f02673948a8d4aba07ce42a2dd354be9a1f73447`
- Fresh Studio launch: `node ./dist/cli/pokie.js --no-open`
- CLI input: `Pc19 Delta`, created with seed `19`; SHA-256
  `7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`
- Browser launch began 2026-09-07T11:14:11Z with a new Studio home and
  Chromium profile.

## Action correlation

1. Ready state: rendered Design page with the selected CLI-created blueprint,
   valid tabs, absolute `Load from path`, and enabled `Save game`.
2. Exact single activation: visible `Save game` at 2026-09-07T11:14:21Z.
3. Action-local success claim immediately after activation: `Your game was
   saved. Opening its workspace…`.
4. Bounded wait kept that same local message and never rendered a workspace,
   action-local error, or a created/queued operation id.
5. Recovery observation, without another Save: rendered `Projects` at
   2026-09-07T11:14:56Z stated `No games yet. Start a game or add one you
   already have.`

This is a contradicted visible success claim: the promise was a saved workspace,
and its action-local recovery surface showed the object absent. It is therefore
a reproducible P1 product finding with `synchronous_terminal=true`, not a
driver timeout. The Browse retry was the single permitted safe retry; the
non-idempotent Save was activated once only.
