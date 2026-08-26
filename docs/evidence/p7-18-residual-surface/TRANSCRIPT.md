# P7-18 targeted rerun

Command:

```sh
npm run test:targeted -- tests/cli/residualPublicSurface.contract.test.ts tests/cli/publicCommandTree.test.ts tests/cli/commands/GenerateCommand.test.ts tests/cli/commands/SampleCommand.test.ts tests/cli/cliCommandInventory.contract.test.ts tests/cli/dispatch.test.ts
```

Result:

```text
PASS pokie tests/cli/residualPublicSurface.contract.test.ts
PASS pokie tests/cli/publicCommandTree.test.ts
PASS pokie tests/cli/commands/GenerateCommand.test.ts
PASS pokie tests/cli/commands/SampleCommand.test.ts
PASS pokie tests/cli/cliCommandInventory.contract.test.ts
PASS pokie tests/cli/dispatch.test.ts

Test Suites: 6 passed, 6 total
Tests:       1095 passed, 1095 total
Snapshots:   0 total
```
