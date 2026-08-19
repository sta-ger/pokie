# P6-20 whole-file consumer-test verification

Verification date: 2026-08-19 (Europe/Warsaw)

Candidate under test: `6e71db3ec302d0a7a55b624754a985ecac2d785e`

Companion checkout: `/home/stager/Work/sta-ger/pokie-examples` at `09a0889b8d335eeacbdb277c37376d97de96c268` (clean before and after)
Runtime: `/home/stager/.nvm/versions/node/v24.18.0/bin/node` (`v24.18.0`), which satisfies the candidate's `^20.19.0 || >=22.12.0` engine requirement.

Command (from the candidate root):

```text
POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples /home/stager/.nvm/versions/node/v24.18.0/bin/node --max-old-space-size=512 ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath [the 10 persisted required_test_files]
```

Machine-owned Jest result excerpt (raw-log SHA-256: `8b99f9813603fd2b3c4158ef769fe0db3b4caf59f38ec852bd60eb75f9fa8ac2`):

```text
PASS pokie-examples ../../../../pokie-examples/tests/ui.test.ts
PASS pokie tests/cli/client/player/renderPlayer.test.ts
PASS pokie-integration tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts (54.343 s)
PASS studio-client-components tests/cli/studio-client/src/components/project/PlayTab.test.tsx
PASS studio-client-workflows tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx (14.118 s)
PASS studio-client-components tests/cli/studio-client/src/components/project/ReplayTab.test.tsx
PASS studio-client-workflows tests/cli/studio-client/src/openProjectGuard.test.tsx (29.93 s)
PASS pokie tests/server/session/FileSessionRepository.test.ts
PASS pokie tests/simulation/parallel/SimulationWorkerCoordinator.test.ts
PASS pokie tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts

Test Suites: 10 passed, 10 total
Tests:       102 passed, 102 total
Snapshots:   0 total
Time:        108.15 s
```

No generated test outputs or raw full logs are retained. The host's default Node 18 was not used for the successful result because it does not meet the candidate's declared engine requirement.
