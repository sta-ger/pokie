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
    // A WASM build target. Reserved for a future export target: as of this writing no ProjectCapability is
    // granted to "wasm" (see ProjectCapabilities.ts), so every operation against a "wasm" project is
    // unsupported today by design, not by omission — this is what exercises the "no alternatives" branch of
    // an UnsupportedProjectOperationDiagnostic.
    | "wasm"
    // A PAR sheet workbook file — "pokie par import"/"pokie par export"'s own .xlsx format (see
    // parsheet/ParSheetImporter.ts / ParSheetExporter.ts).
    | "parWorkbook";
