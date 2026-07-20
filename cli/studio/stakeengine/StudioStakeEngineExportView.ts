import type {StakeEngineManifest, ValidationIssue} from "pokie";

// POST /api/project/stakeengine/export's own DTO — mirrors StakeEngineExporter's own "no partial export"
// contract exactly: `manifest` is present iff `status` is "ok", every field on it comes straight off the
// real StakeEngineManifest the exporter produced, never re-derived here. "conflict" mirrors
// StudioParSheetExportView's own overwrite-confirmation contract (see
// StudioStakeEngineExportService.export()'s own doc comment) — never a write.
export type StudioStakeEngineExportView =
    | {
          readonly status: "ok";
          readonly outDir: string;
          readonly files: readonly string[];
          readonly manifest: StakeEngineManifest;
          readonly warnings: readonly ValidationIssue[];
      }
    | {readonly status: "conflict"; readonly outDir: string; readonly error: string}
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
