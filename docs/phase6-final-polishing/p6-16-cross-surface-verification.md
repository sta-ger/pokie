# P6-16 independent host verification

Verified candidate `4619fc4de83afe382130ee0a9f491a95084dd721` on 2026-08-19.

The verifier used temporary Node `v22.19.0` because the required Zstandard
coverage directly exercises Node's native zstd API. The repository and the
temporary code-first fixtures were clean after the runs; no generated output,
logs, browser profiles, or test artifacts were retained.

Each persisted path was passed literally to the checked-in Jest runner as a
complete `--runTestsByPath` file run:

```text
tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.save.test.tsx
  PASS: 1 suite, 6 tests
tests/cli/studio-client/src/components/blueprintEditor/PaylinePresetsModal.test.tsx
  PASS: 1 suite, 8 tests
tests/cli/studio-client/src/components/common/PathBrowseModal.test.tsx
  PASS: 1 suite, 7 tests
tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx
  PASS: 1 suite, 15 tests
tests/cli/studio/StudioArtifactBuildService.test.ts
  PASS: 1 suite, 18 tests
tests/project/ArtifactBuilderRegistry.test.ts
  PASS: 1 suite, 23 tests
tests/stakeengine/internal/zstd.test.ts
  PASS: 1 suite, 2 tests
```

Representative command (the same checked-in runner and flags were used for
each literal file above):

```text
PATH=<temporary-node-22-bin>:$PATH node --max-old-space-size=512 \
  ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath <required-path>
```

The `StudioArtifactBuildService` complete-file run also completed the real
code-first lifecycle: `pokie init --no-prepare`, then the fixture's actual
`npm install` and `npm run build`. Its Blueprint-to-Stake case wrote the Stake
`index.json` and registered the generated Outcome Project; its TypeScript
package case preserved `base` and `ante` in the Outcome `manifest.json` and
Stake `pokie-manifest.json`. `ArtifactBuilderRegistry` independently passed
the corresponding real tsPackage Outcome-to-Stake registry conversion.

Result: all required whole-file checks are green; the requested Game Model and
Outcome-to-Stake behavior is independently confirmed. No finding.
