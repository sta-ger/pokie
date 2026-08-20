# P6-20 targeted runtime-test verification

Machine-owned verification of candidate
`43684fdd703f5c5c2ea438f706c267c464c34eb1`.

- Checkout HEAD before the run: `43684fdd703f5c5c2ea438f706c267c464c34eb1`
- Companion checkout: `/home/stager/Work/sta-ger/pokie-examples` at
  `6bb67dee3d2e8e98bab754e1000019701a17266b`, clean and read-only.
- Runtime: `/home/stager/.nvm/versions/node/v24.18.0/bin/node` (`v24.18.0`),
  matching this checkout's `.nvmrc` major version.
- Started: `2026-08-20T01:28:06.847Z`.

The complete-file command was:

```sh
/home/stager/.nvm/versions/node/v24.18.0/bin/node --max-old-space-size=512 \
  ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath --silent --json \
  --outputFile=/tmp/p6-20-targeted-results-node24-43684fdd.json \
  tests/cli/client/player/renderPlayer.test.ts \
  tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx \
  tests/cli/studio-client/src/components/project/PlayTab.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx \
  tests/cli/studio-client/src/components/project/ReplayTab.test.tsx \
  tests/cli/studio/StudioServer.test.ts \
  tests/server/session/FileSessionRepository.test.ts \
  tests/simulation/parallel/SimulationWorkerCoordinator.test.ts \
  tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts
```

Jest reported `success: true`: 9/9 suites passed, 371 tests passed, 0 failed,
and 2 skipped. The only skipped tests are in `renderPlayer.test.ts`.

| Complete file | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `tests/cli/client/player/renderPlayer.test.ts` | 22 | 0 | 2 |
| `tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx` | 19 | 0 | 0 |
| `tests/cli/studio-client/src/components/project/PlayTab.test.tsx` | 1 | 0 | 0 |
| `tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx` | 11 | 0 | 0 |
| `tests/cli/studio-client/src/components/project/ReplayTab.test.tsx` | 2 | 0 | 0 |
| `tests/cli/studio/StudioServer.test.ts` | 278 | 0 | 0 |
| `tests/server/session/FileSessionRepository.test.ts` | 15 | 0 | 0 |
| `tests/simulation/parallel/SimulationWorkerCoordinator.test.ts` | 17 | 0 | 0 |
| `tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts` | 6 | 0 | 0 |

The ephemeral Jest JSON result was not retained. Its SHA-256 was
`ea2e7c72962abca40b6352e0ffb32e5eecc2c76e201dbda38b39704e0a8b0797`
(195,906 bytes). No new P0, P1, or material P2 finding was observed.
