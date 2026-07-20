import {
    computeWeightedOutcomeLibraryHash,
    isRecognizedStakeEngineExportDirectory,
    StakeEngineExporter,
    StakeEngineExporting,
    StakeEngineExportModeInput,
    StakeEngineExportValidating,
    StakeEngineExportValidator,
} from "pokie";
import fs from "fs";
import {loadWeightedOutcomeLibraryFromProjectFile} from "../deployment/loadWeightedOutcomeLibraryFromProjectFile.js";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";
import type {StudioStakeEngineExportValidateView} from "./StudioStakeEngineExportValidateView.js";
import type {StudioStakeEngineExportView} from "./StudioStakeEngineExportView.js";

type LoadModesResult =
    | {readonly status: "ok"; readonly loaded: readonly StakeEngineExportModeInput<string>[]}
    | {readonly status: "load-error"; readonly error: string};

// The Project Dashboard's Stake Engine Export tab, built directly on top of pokie's own
// StakeEngineExporter/StakeEngineExportValidator (see docs/stake-engine-export.md) — this class never
// converts a payoutMultiplier into Stake units, renders a lookup CSV, computes a library hash, or
// re-implements the exporter's own atomic-directory-replace/"no partial export" contracts; it only
// resolves each mode's own project-relative libraryPath (the same loadWeightedOutcomeLibraryFromProjectFile
// the Deployment tab already uses) and shapes the result into a view.
export class StudioStakeEngineExportService {
    private readonly exporter: StakeEngineExporting<string>;
    private readonly validator: StakeEngineExportValidating<string>;
    private readonly readFile: (resolvedPath: string) => string;
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        pokieVersion: string,
        exporter: StakeEngineExporting<string> = new StakeEngineExporter<string>(pokieVersion),
        validator: StakeEngineExportValidating<string> = new StakeEngineExportValidator<string>(),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.exporter = exporter;
        this.validator = validator;
        this.readFile = readFile;
        this.realpath = realpath;
    }

    // The exact preflight StakeEngineExporter itself runs (and aborts the whole export on) before writing
    // a single file — exposed as its own step so the user can check a candidate mode set before committing
    // to Export, without triggering a write attempt. Also returns a per-mode provenance summary (outcome
    // count, libraryId/hash) read straight off each loaded library, never Stake-specific and never
    // recomputed beyond what computeWeightedOutcomeLibraryHash already does for every other tab.
    public validate(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): Promise<StudioStakeEngineExportValidateView> {
        const loaded = this.loadModes(projectRoot, modes);
        if (loaded.status === "load-error") {
            return Promise.resolve(loaded);
        }

        const issues = this.validator.validate(loaded.loaded);
        return Promise.resolve({
            status: "ok",
            modes: loaded.loaded.map((mode) => ({
                modeName: mode.modeName,
                cost: mode.cost,
                outcomeCount: mode.library.outcomes.length,
                libraryId: mode.library.libraryId,
                libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
            })),
            errors: issues.filter((issue) => issue.severity === "error"),
            warnings: issues.filter((issue) => issue.severity !== "error"),
        });
    }

    // Runs the real export once every mode's library has been loaded — StakeEngineExporter itself runs
    // full validation again here (never trusted from an earlier validate() call, which could be stale by
    // the time Export is actually clicked) and never writes anything on any validation error.
    //
    // A pre-existing, non-empty outDir is refused with "conflict" unless `overwrite` is set — the same
    // fs.existsSync/overwrite gate StudioBlueprintService.exportParSheet() uses (see its own doc comment).
    // This only ever adds a confirmation step in *front* of the exporter's own write: the exporter itself
    // still refuses (throws) an existing directory it doesn't recognize as one of its own prior runs
    // regardless of `overwrite` — see assertSafeToReplaceStakeEngineExportDirectory — so the conflict view's
    // own `overwritable` flag (via isRecognizedStakeEngineExportDirectory, the same recognition check) tells
    // the caller up front whether resubmitting with `overwrite: true` could ever succeed, rather than letting
    // it try and only find out from a generic load-error once the exporter itself has already refused.
    public async export(
        projectRoot: string,
        modes: readonly StudioStakeEngineExportModeInput[],
        outDir: string,
        overwrite: boolean,
    ): Promise<StudioStakeEngineExportView> {
        const resolvedOutDir = resolveProjectDirectory(projectRoot, outDir, this.realpath);
        if (resolvedOutDir.status === "error") {
            return {status: "load-error", error: resolvedOutDir.message};
        }

        const loaded = this.loadModes(projectRoot, modes);
        if (loaded.status === "load-error") {
            return loaded;
        }

        if (fs.existsSync(resolvedOutDir.resolvedPath) && fs.readdirSync(resolvedOutDir.resolvedPath).length > 0 && !overwrite) {
            const overwritable = isRecognizedStakeEngineExportDirectory(resolvedOutDir.resolvedPath);
            return {
                status: "conflict",
                outDir: resolvedOutDir.resolvedPath,
                overwritable,
                error: overwritable
                    ? `"${outDir}" already exists and is not empty. Resubmit with "overwrite": true to replace it.`
                    : `"${outDir}" already exists and is not empty, and wasn't produced by a previous Stake Engine export. Choose a different output directory or empty it first.`,
            };
        }

        let result;
        try {
            result = await this.exporter.exportToDirectory(loaded.loaded, resolvedOutDir.resolvedPath);
        } catch (error) {
            return {status: "load-error", error: `Could not export to "${outDir}": ${error instanceof Error ? error.message : String(error)}`};
        }

        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (result.manifest === undefined || errors.length > 0) {
            return {status: "invalid", errors, warnings: result.issues.filter((issue) => issue.severity !== "error")};
        }
        return {status: "ok", outDir: result.outDir, files: result.files, manifest: result.manifest, warnings: result.issues};
    }

    private loadModes(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): LoadModesResult {
        const loaded: StakeEngineExportModeInput<string>[] = [];
        for (const mode of modes) {
            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, mode.libraryPath, this.readFile, this.realpath);
            if (result.status === "error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${result.message}`};
            }
            loaded.push({modeName: mode.modeName, cost: mode.cost, library: result.library});
        }
        return {status: "ok", loaded};
    }
}
