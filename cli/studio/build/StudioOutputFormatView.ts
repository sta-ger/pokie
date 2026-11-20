import type {FormatConversionPlan, OutputFormat, BuildProductMatrixCellState} from "@fromstan/pokie";

// GET /api/project/build/targets' own DTO -- one entry per BuildOutputBuilderRegistry.listTargets(),
// with `supported` already resolved against the active project's own ProjectType (see
// StudioBuildService.listTargets). ExportDeployTab uses this server-resolved flag to enable only
// buildable cards and to explain why unavailable cards cannot run, rather than re-deriving its own
// ProjectType/capability rule -- see ExportDeployTargets.ts's own doc comment for why that duplication is
// exactly what this endpoint exists to remove.
export type StudioOutputFormatView = {
    readonly target: OutputFormat;
    readonly supported: boolean;
    readonly state: BuildProductMatrixCellState;
    readonly diagnostic?: string;
    // The server's canonical planner payload. The client presents it, but never recreates an edge from
    // source/target labels or an old matrix row.
    readonly plan: FormatConversionPlan;
    readonly unsupportedNotes: readonly string[];
};
