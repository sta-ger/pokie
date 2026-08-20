# P6R-04 independent rendered verification

Candidate: `3a0ef73737a5c9419639977031c328fc3366a0d7`.

## Result: findings (P2)

The public root route loaded from a fresh candidate Studio launch (`node
./dist/cli/pokie.js --no-open`).  In visible Studio controls, the recommended
Random model generated and saved `P6 Random Name Final`, but **Create Project**
did not open its Workspace.  The rendered error says the Blueprint runtime
dependencies could not be installed in the materialization cache.  The model
was still rendered as valid.  Therefore Play, Simulation, Replay, Reel Strip
Modeler, and Build/Export were not reachable from this required workflow.

At the 405px viewport, Projects is also materially clipped: the sidebar is
rendered at x=16--243, Projects content starts at x=299, and the saved
project's rendered **Open** action starts at x=442--outside the 405px
viewport.  The accompanying phone screenshot records the unscrolled initial
view.  The desktop Projects screenshot shows that the saved project remains
registered and exposes its Open action there.

## Candidate-bound machine check

After one candidate build, one complete-file command was run:

```text
npm run test:targeted -- \
  tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.simulationWorkflow.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx \
  tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx \
  tests/cli/studio-client/src/integration/happyPath.test.tsx \
  tests/cli/studio/StudioServer.test.ts
```

Its machine result cache records seven passing files and one failing file:
`ProjectDashboardPage.replayWorkflow.test.tsx`.  The candidate-modified
`ProjectDashboardPage.exportDeploy.test.tsx` passed.  This is retained as the
bounded result, not a rerun.

## Retained evidence

| Surface | File | SHA-256 |
| --- | --- | --- |
| Project desktop | `projects-desktop.png` | `ed0af088ec6888d4a05a4ae0f7f68ee46feeb0f49d408142f3ad6f9d23c3b4be` |
| Project 405px | `projects-405px.png` | `fe79ab9986ef5bfed745448b974f6d4ee33454a5fdac217f642a5081255f0f26` |
| Workspace-open rendered error | `workspace-open-error.png` | `1638e744e8cb0686c4d93c83a2c816106fe02a4f811ed5e1c512abc2846ff718` |

No generated project/output tree, browser profile, logs, automation source,
or Build/Export screenshot was retained.  Build/Export was not reached after
the rendered Workspace-open failure.
