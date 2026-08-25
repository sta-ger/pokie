// The kinds of on-disk input POKIE's CLI/Studio surfaces resolve "a project" to — PokieProject's own
// discriminant. Deliberately a closed union (unlike ExternalDeploymentCapability's open string vocabulary):
// every consumer that switches on PokieProject.type needs a compile-time-exhaustive switch, and adding a
// seventh kind is itself a source change to this package, not something a third party registers on its own
// the way an ExternalDeploymentTarget's capabilities can.
export type ProjectType =
    // A GameBlueprint JSON source file — "pokie build"'s own input (see src/generated/GameBlueprint.ts).
    | "blueprint"
    // An already-loadable PokieGame package directory, hand-editable or generated — the same "pokie.entry"
    // package.json contract findPokieProjectRoot/loadPokieGame read (see gamepackage/readPokiePackageConfig.ts).
    | "tsPackage"
    // A pre-built outcome-library bundle directory — "pokie outcomelibrary build"'s own output (see
    // weightedoutcome/bundle/OutcomeLibraryBundleManifest.ts).
    | "outcomeLibrary"
    // A Stake Engine export directory — "pokie stakeengine export"'s own output (see
    // stakeengine/isRecognizedStakeEngineExportDirectory.ts).
    | "stakeAdapter"
    // A WASM component project type: a ".wasm" file paired with a sidecar PokieWasmComponentManifest
    // WasmProjectTargetAdapter recognizes as contract-compatible (see project/wasm/PokieWasmComponentManifest.ts
    // and docs/wasm-compatibility-boundary.md). Resolves read-only — ProjectCapabilities.ts grants "wasm" only
    // WASM_MANIFEST_READ_CAPABILITY, never WASM_EXPORT_CAPABILITY or RUNTIME_EXECUTE_CAPABILITY (POKIE has no
    // WASM build/export product or execution backend). An
    // ordinary ".wasm" file with no sidecar manifest, or one whose manifest fails validation/compatibility,
    // is still not a supported POKIE project — see WasmProjectTargetAdapter's own doc comment for the exact
    // three-way split.
    | "wasm"
    // A PAR sheet workbook file — "pokie par import"/"pokie par export"'s own .xlsx format (see
    // parsheet/ParSheetImporter.ts / ParSheetExporter.ts).
    | "parWorkbook";
