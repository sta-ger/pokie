# P7-16 package-input classification: independent targeted verification

Candidate verified: `26a645c8ee33f7f516d9a3030f3a43b9b096d939`.

Machine-owned command, executed once from this checkout without a test-name filter:

```text
npm run test:targeted -- tests/cli/cliCommandInventory.contract.test.ts tests/cli/commands/ExportCommand.test.ts tests/cli/commands/ImportCommand.test.ts tests/cli/packageOnlyCommandInputs.contract.test.ts
```

Result: Jest passed all four requested complete files: 4 suites passed, 1,099 tests
passed, 0 snapshots.  The output explicitly lists
`tests/cli/packageOnlyCommandInputs.contract.test.ts` as passing and states that all
four paths were run.

The complete package-only contract contains three assertions.  It requires one
classification per inventory `(command, verb)` pair, requires every package-only
classification to have `packageRoot` as its frozen positional, and fixes the exact
package-only set.  The candidate fixture includes exactly one `import` and one
`export` entry; both have `requiresLoadablePackage: false` and primary input
`source`.
