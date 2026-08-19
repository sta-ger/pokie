# P6-17 Design and UX review

Reviewed the Studio as a task workspace rather than as a collection of
components. The bounded route inventory is executable in
`tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx`; it
covers Home (Design Game and Projects), each Project Dashboard section,
Game Model, Play, Simulation, Replay, Build/Export, Outcome Projects,
dialogs/pickers, and representative empty, loading, success, warning, error,
and disabled states. The existing P6-15 Chrome capture remains the live-browser
scale evidence for the terminal Replay state.

## Findings and resolution

| Severity | Surface | Finding | Resolution |
| --- | --- | --- | --- |
| P2 | Projects → Import Project | `Detect` accepted an empty location, then silently did nothing. This was a dead end and gave neither a next action nor an accessible reason for the control's unavailable state. | The action is disabled while Location is blank, with adjacent guidance programmatically associated through `aria-describedby`. Entering a location removes the explanation and enables the same natural Detect → Register workflow. |

The correction preserves the existing navigation, form, and project-import
contract; it is a bounded interaction-state fix, not a design-system rewrite.

## Regression rerun

`npm run test:targeted -- tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx`

Passed: 1 suite, 26 tests. The rerun clicks the disabled and enabled Import
Project states, verifies no request can be issued before a location exists,
and verifies the explanation is removed once the next action becomes available.
The surrounding route inventory also reruns the Home, Game Model, Play,
Simulation, Replay, Build/Export, Outcome Project, dialogs/pickers, status
states, navigation, progressive disclosure, stepper reachability, and
path-error recovery checks.

This regression rerun closes the Projects finding; it is not a substitute for
the remaining full browser screenshot audit.
