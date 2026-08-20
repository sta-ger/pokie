# P6-20 targeted host verification

Machine-owned verification ran in candidate worktree HEAD
`4aa9e90b72d95f11333af0f9c2b2a8bd0ba6a9db`. The supplied read-only
companion checkout was clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b` before the run.

The companion root was explicitly bound with
`POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples`, then this
single complete-file command exited `0`:

```sh
npm run test:targeted -- /home/stager/Work/sta-ger/pokie-examples/tests/ui.test.ts tests/cli/client/player/renderPlayer.test.ts tests/cli/studio-client/src/components/project/PlayTab.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx tests/cli/studio-client/src/components/project/ReplayTab.test.tsx tests/server/session/FileSessionRepository.test.ts tests/simulation/parallel/SimulationWorkerCoordinator.test.ts tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts
```

Jest's final result: `Test Suites: 8 passed, 8 total`; `Tests: 87 passed,
87 total`; `Snapshots: 0 total`; `Time: 24.315 s`; `Ran all test suites ...
in 4 projects`.

The runner reported PASS for each requested file, including companion
`pokie-examples/tests/ui.test.ts`, `renderPlayer.test.ts`, `PlayTab.test.tsx`,
`ProjectDashboardPage.playWorkflow.test.tsx`, `ReplayTab.test.tsx`,
`FileSessionRepository.test.ts`, `SimulationWorkerCoordinator.test.ts`, and
`StakeEngineBundleStreamingExporter.test.ts`.
