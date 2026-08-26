# P7-12 targeted verification — 2026-08-26

The following foreground command passed on the implementation tree:

```text
npm run test:targeted -- tests/diff/SimulationReportDiffer.test.ts tests/diff/SimulationReportSetDiffer.test.ts tests/project/diffOutcomeSourceProjects.test.ts tests/cli/commands/DiffCommand.test.ts tests/cli/commands/OutcomeSourceCommand.test.ts tests/cli/cliCommandInventory.contract.test.ts tests/cli/packageOnlyCommandInputs.contract.test.ts
```

```text
PASS pokie tests/cli/packageOnlyCommandInputs.contract.test.ts
PASS pokie tests/cli/commands/DiffCommand.test.ts
PASS pokie tests/cli/cliCommandInventory.contract.test.ts
PASS pokie tests/cli/commands/OutcomeSourceCommand.test.ts
PASS pokie tests/project/diffOutcomeSourceProjects.test.ts
PASS pokie tests/diff/SimulationReportDiffer.test.ts
PASS pokie tests/diff/SimulationReportSetDiffer.test.ts

Test Suites: 7 passed, 7 total
Tests:       1150 passed, 1150 total
```

The rerun exercises fresh temporary simulation reports (`SimCommand`), Outcome Library bundles
(`OutcomeLibraryBundleWriter`), and Stake Engine exports (`StakeEngineExporter`). Assertions parse both JSON stdout
and `--out` contents, verify `changed`, retain added/removed modes, and reject a simulation-report/outcome-source
mix with product-facing compatibility guidance.
