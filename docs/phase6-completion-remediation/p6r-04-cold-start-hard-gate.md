# P6R-04 cold-start product hard gate

Candidate: `53035696fdbf5c7010e0942cf67596f555acc492` (before this evidence-only
record).

This current-step record keeps the product hard gate bounded to the rendered
Studio controls and the server entry point that serves them. It does not alter
or replace the immutable P6-15--P6-20 evidence.

## Rendered interaction closure

The machine-owned rendered-control suites cover the following complete paths:

1. Start on **Design Your Game**, use the validated recommended model, and
   choose **Create Project**. The saved project opens into its workspace.
2. In the Reel Strip Modeler, select a reel, create visual spacing,
   occurrence, preset, and stack constraints, preview the generated strip,
   apply it, and save the project. The advanced constraints JSON editor remains
   reachable and reflects the visual draft without making raw JSON the primary
   workflow.
3. From the workspace, create a Play session and spin, run a Simulation to its
   rendered report, and select a rendered Replay source and record.
4. In **Build/Export**, generate an outcome library, then run the enabled
   **Stake Engine Export** action using that exact generated bundle. Build
   targets remain task-led; adapter, capability, destination-protocol, and
   compatibility details are available only through **Advanced details**.
5. The Projects registry retains a practical desktop table/card surface and
   stacks each project card at a 405px-class phone breakpoint, leaving project
   actions visible. Project location is not primary workspace chrome; it is
   available on demand under **Advanced details**.

The server-side Studio regression suite additionally confirms that the public
root route serves `index.html`, closing the prior cold-start `Not found: /`
dead end before client interaction begins.

## Verification commands

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

The command is the complete-file regression closure for this gate: its Studio
component/workflow tests exercise the controls above, while `StudioServer` owns
the actual root-route response. The retained P6-20 visual surface matrix and
its representative screenshots remain immutable historical evidence; this
step adds no duplicate screenshots.
