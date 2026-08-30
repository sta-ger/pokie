# PC-13 shared-contract whole-file verification

Candidate commit verified: `e046987e2d09e5adc1ca2cbb51e13b0c3d1a6fe9` (`[PC-13] cover real WASM session invalidation`).

Executed once, from this checkout, as one complete-file process:

```text
npm run test:targeted -- tests/project/ArtifactBuilderRegistry.test.ts tests/project/ArtifactConversionPlanner.test.ts tests/project/BuildProductMatrix.contract.test.ts tests/project/ProjectCapabilities.test.ts tests/project/describeUnsupportedProjectOperation.test.ts tests/project/wasm/assessWasmComponentCompatibility.test.ts
```

Result: exit 0; 6 suites passed; 82 tests passed; 0 snapshots.

The passing contracts demonstrate that the registry and build-product matrix advertise five targets and exclude `wasm`; the conversion planner treats WASM input as metadata-only; and WASM grants only `WASM_MANIFEST_READ_CAPABILITY`, not export or runtime execution.  The compatibility suite also verifies bounded manifest compatibility assessment.
