import type {StakeEngineManifest, ValidationIssue} from "pokie";

// POST /api/project/stakeengine/export's own DTO — mirrors StakeEngineExporter's own "no partial export"
// contract exactly: `manifest` is present iff `status` is "ok", every field on it comes straight off the
// real StakeEngineManifest the exporter produced, never re-derived here. "conflict" mirrors
// StudioParSheetExportView's own overwrite-confirmation contract (see
// StudioStakeEngineExportService.export()'s own doc comment) — never a write. `overwritable` is `true`
// only when `outDir` is recognized (via isRecognizedStakeEngineExportDirectory) as a *prior* "pokie
// stakeengine export" run's own output — resubmitting with `overwrite: true` can only ever succeed in that
// case, since the exporter itself still unconditionally refuses to replace a non-empty directory it
// doesn't recognize as one of its own (see StakeEngineExporter's own assertSafeToReplaceStakeEngineExportDirectory
// call). `overwritable: false` means there is no way to make this request succeed short of choosing a
// different `outDir` or emptying it by hand — the client must never offer an "Overwrite" action for it.
export type StudioStakeEngineExportView =
    | {
          readonly status: "ok";
          readonly outDir: string;
          readonly files: readonly string[];
          readonly manifest: StakeEngineManifest;
          readonly warnings: readonly ValidationIssue[];
      }
    | {readonly status: "conflict"; readonly outDir: string; readonly overwritable: boolean; readonly error: string}
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
