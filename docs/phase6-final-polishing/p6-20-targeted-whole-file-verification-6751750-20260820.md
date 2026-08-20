# P6-20 targeted whole-file verification

Date: 2026-08-20 (Europe/Warsaw)

This evidence-only commit records an independent complete-file targeted test
run. The POKIE worktree was clean at
`675175008f257909e932887d07c5d011dab383dd`; the read-only companion
`/home/stager/Work/sta-ger/pokie-examples` was clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b`.

The following one in-band command completed with exit status 0:

```sh
npm run test:targeted -- ../pokie-examples/tests/ui.test.ts tests/cli/client/player/renderPlayer.test.ts tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx tests/cli/studio-client/src/components/project/PlayTab.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx tests/cli/studio-client/src/components/project/ReplayTab.test.tsx tests/cli/studio/StudioServer.test.ts tests/server/session/FileSessionRepository.test.ts tests/simulation/parallel/SimulationWorkerCoordinator.test.ts tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts
```

This invocation exercised every requested path as a complete file, including
the companion `ui.test.ts`. No implementation or test files were modified.
