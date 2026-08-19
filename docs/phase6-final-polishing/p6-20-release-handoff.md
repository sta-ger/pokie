# P6-20 release handoff

This is a handoff record, **not** a campaign-completion claim.  The task
worktree is exactly local `develop` at `6575b0531679b678075902560efe2196b4126040` before this
record; it has no configured POKIE remote, and this task has no publication or
Google Drive authority.  Those operations remain with the orchestrator.

## Deterministic Player parity

The checked-in parity fixture is `fixture-slot`, seed `fixture-round`, round
one.  It reaches the public `pokie/client/player` entry point in all product
presentations:

- the companion's public Fixture Slot page boots its normal `initializeUi()`
  and a real seeded `VideoSlotSession`;
- `pokie client` and `pokie dev` call the same Player barrel;
- Studio Play and Replay call it through `CanonicalPlayerView`.

The captured runtime round and the three presentation tests verify the 3x3
orientation, A/C symbols, top-row line-1 winning positions, 5-credit win,
paytable, credits/bet information, and the no-feature/no-bet-mode state.  The
same selected Player renderer clears those optional views when the game does
not support them, rather than inventing format-specific presentation state.
See the existing P5 parity capture and the current source regression tests:

```text
docs/phase5-evidence/p5-polish-19/parity/
tests/cli/client/player/renderPlayer.test.ts
tests/cli/studio-client/src/components/project/PlayTab.test.tsx
tests/cli/studio-client/src/components/project/ReplayTab.test.tsx
```

The companion checkout now also documents the public Fixture Slot entry in its
README (commit `c36f83b68dca6be9d4a56e0c66e6ddb5819e1f28`).

## Local completion preflight

The following command passed on the candidate source tree:

```sh
npm run test:targeted -- \
  tests/cli/client/player/renderPlayer.test.ts \
  tests/cli/studio-client/src/components/project/PlayTab.test.tsx \
  tests/cli/studio-client/src/components/project/ReplayTab.test.tsx \
  tests/project/ProjectTargetResolver.test.ts \
  tests/project/describeUnsupportedProjectOperation.test.ts
```

It reported five passing suites and 63 passing tests.  The final two suites
exercise the discriminated generic `PokieProject` resolver/capability boundary;
the Player suites exercise the real dev-client, Studio Play, and Studio Replay
consumers, rather than a parallel renderer.

## Required orchestrator completion actions

Do not mark Phase 6 complete from this handoff.  The orchestrator must still:

1. run its owned `check:release` and packaging gates on the integrated exact
   `develop` commit;
2. conduct the independent final browser/CLI review and remediate any
   P0/P1/material-P2 finding before repeating the gate;
3. verify clean/exact `develop`, publish through the normal release path, and
   verify the published result in Google Drive; then record the final
   `develop` SHA and concise publication evidence.

No recovery state is represented as completed by this record: missing release,
publication, or Drive evidence remains a blocking condition, not a report-only
substitute.
