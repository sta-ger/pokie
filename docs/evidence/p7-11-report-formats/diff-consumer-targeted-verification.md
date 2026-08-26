# P7-11 diff-consumer targeted verification

Verified candidate: `f38454583d90ee408da0d01bfed8fcfa07d9d1bb`.

One serial targeted Jest invocation ran every required complete file:

```text
npm run test:targeted -- tests/cli/BuildWorkflow.integration.test.ts tests/cli/InitCommandWorkflow.integration.test.ts tests/cli/cliCommandInventory.contract.test.ts tests/cli/commands/DiffCommand.test.ts tests/cli/commands/ReportCommand.test.ts tests/cli/commands/SimCommand.test.ts tests/cli/publicCommandTree.test.ts tests/cli/studio/StudioServer.test.ts tests/diff/SimulationReportSetDiffer.test.ts tests/reporting/HtmlSimulationReportRenderer.test.ts tests/reporting/MarkdownSimulationReportRenderer.test.ts tests/reporting/SimulationReportBuilder.test.ts
```

Jest reported **12/12 suites passed** and **1,575/1,575 tests passed** in
21.311 s.  This included the two review-requested complete files:
`DiffCommand.test.ts` and `SimulationReportSetDiffer.test.ts`.

The passing `DiffCommand` coverage proves that two `pokie sim --mode all`
report sets use the report-set branch: common modes are diffed independently,
one-sided modes are retained, and no blended total is made.  It also proves
the explicit safe diagnostic when a single-mode report is compared with a
multi-mode report set.  The passing set-differ file independently verifies
per-mode delegation and `onlyInLeft`/`onlyInRight` behavior.

The shared guard validates nested mode reports before they are treated as a
set.  A malformed nested report therefore falls through to DiffCommand's
established `does not look like a pokie sim report` diagnostic rather than
being diffed as a set; the complete DiffCommand file includes that safe
diagnostic path.  The same run's complete `ReportCommand.test.ts` additionally
verifies malformed report rejection before a partial document is emitted.

After reporting the passing results, Jest retained an open-handle advisory and
did not exit during a bounded 90-second wait.  No test failure or rendered
product error followed; the already-complete process was stopped without
starting another test command.  No generated artifacts or raw logs are
retained.
