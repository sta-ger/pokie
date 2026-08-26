# P7-11 targeted scope-preflight verification

Candidate checked out: `a26ef3e30b4087bc2529317731358aa091fc4f9e`.

One non-concurrent, complete-file invocation was run from this checkout:

```text
npm run test:targeted -- tests/cli/BuildWorkflow.integration.test.ts tests/cli/InitCommandWorkflow.integration.test.ts tests/cli/cliCommandInventory.contract.test.ts tests/cli/commands/SimCommand.test.ts tests/cli/publicCommandTree.test.ts tests/cli/studio-client/src/api/apiClient.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.simulationWorkflow.test.tsx tests/cli/studio/StudioServer.test.ts tests/cli/studio/simulation/StudioSimulationService.test.ts tests/cli/studio/simulation/buildSimulationReportDownload.test.ts tests/reporting/HtmlSimulationReportRenderer.test.ts tests/reporting/MarkdownSimulationReportRenderer.test.ts tests/reporting/SimulationReportBuilder.test.ts tests/scripts/run-phase7-journey.test.mjs
```

Machine result: **14/14 suites passed; 1,674/1,674 tests passed; 0 snapshots**
in 64.95 seconds, across four Jest projects.  The run covers init/build package
lifecycle, command inventory and public command tree parity, simulation and
report contracts, HTML/Markdown/report construction, Studio server/API/UI and
download behavior, and retained Phase 7 journey tooling.

Jest emitted its standard post-summary open-handle advisory after all passing
assertions and did not terminate during a further 70-second bounded wait.  No
additional Jest command was started; the idle completed process was interrupted
only after the canonical passing summary had been recorded.  The advisory did
not report a failed assertion or rendered product error.
