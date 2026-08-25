import {ParSheetExporter, prepareBlueprintForParSheetExport} from "../parsheet/ParSheetExporter.js";
import type {ParSheetExporting} from "../parsheet/ParSheetExporting.js";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import type {ParSheetImporting} from "../parsheet/ParSheetImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {
    assertArtifactBuildNotCancelled,
    ArtifactBuildCancelledError,
    captureArtifactDestinationState,
    cleanupIncompleteArtifactOutput,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";

// (Re)publishes an already-exported "parWorkbook" .xlsx file to a new destination, atomically -- reads it back
// with ParSheetImporter and re-exports the resulting GameBlueprint straight through ParSheetExporter, exactly
// the export/import/export round trip tests/parsheet/ParSheetImporter.test.ts already exercises. Never
// re-derives or recomputes anything: this is a validated copy/republish, not a rebuild from a game model (see
// ArtifactBuilderRegistry's own "parWorkbook" unsupportedNotes).
export class ParWorkbookArtifactBuilder implements ArtifactBuilder {
    public readonly target = "parWorkbook";
    public readonly destinationKind = "file";

    private readonly importer: ParSheetImporting;
    private readonly exporter: ParSheetExporting;
    private readonly loadBlueprint: (filePath: string) => unknown;

    constructor(
        pokieVersion: string,
        importer: ParSheetImporting = new ParSheetImporter(),
        exporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
    ) {
        this.importer = importer;
        this.exporter = exporter;
        this.loadBlueprint = loadBlueprint;
    }

    public async validate(source: PokieProject): Promise<void> {
        if (source.type === "blueprint") {
            this.assertBlueprintCanExport(source.rootPath);
            return;
        }
        const imported = await this.importer.importFromFile(source.rootPath);
        const errors = imported.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            throw new Error(
                `Could not read PAR sheet workbook "${source.rootPath}": ${errors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const destinationState = captureArtifactDestinationState(destinationPath, this.destinationKind);

        try {
            reportArtifactBuildProgress(options, {status: "running", message: "Reading PAR workbook"});
            if (source.type === "blueprint") {
                reportArtifactBuildProgress(options, {status: "running", message: "Materializing Blueprint reels for PAR workbook"});
                const prepared = this.assertBlueprintCanExport(source.rootPath);
                reportArtifactBuildProgress(options, {status: "running", message: "Publishing PAR workbook"});
                const exportIssues = await this.exporter.exportToFile(prepared, destinationPath, source.rootPath, {
                    signal: options?.signal,
                    onProgress: (progress) => reportArtifactBuildProgress(options, {status: "running", message: progress.message}),
                });
                const exportErrors = exportIssues.filter((issue) => issue.severity === "error");
                if (exportErrors.length > 0) throw new Error(this.exportErrorMessage(source.rootPath, destinationPath, exportErrors));
                assertArtifactBuildNotCancelled(options);
                reportArtifactBuildProgress(options, {status: "completed"});
                return {outputPath: destinationPath};
            }

            const imported = await this.importer.importFromFile(source.rootPath);
            assertArtifactBuildNotCancelled(options);
            const importErrors = imported.issues.filter((issue) => issue.severity === "error");
            if (importErrors.length > 0) {
                throw new Error(
                    `Could not read PAR sheet workbook "${source.rootPath}": ${importErrors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            reportArtifactBuildProgress(options, {status: "running", message: "Publishing PAR workbook"});
            const exportIssues = await this.exporter.exportToFile(imported.blueprint, destinationPath, source.rootPath, {
                signal: options?.signal,
                onProgress: (progress) => reportArtifactBuildProgress(options, {status: "running", message: progress.message}),
            });
            assertArtifactBuildNotCancelled(options);
            const exportErrors = exportIssues.filter((issue) => issue.severity === "error");
            if (exportErrors.length > 0) {
                throw new Error(this.exportErrorMessage(source.rootPath, destinationPath, exportErrors));
            }

            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath};
        } catch (error) {
            await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            if (options?.signal?.aborted) {
                if (!(error instanceof ArtifactBuildCancelledError)) assertArtifactBuildNotCancelled(options);
            } else reportArtifactBuildProgress(options, {status: "failed", message: "PAR workbook publishing failed"});
            throw error;
        }
    }

    private assertBlueprintCanExport(sourcePath: string) {
        const prepared = prepareBlueprintForParSheetExport(this.loadBlueprint(sourcePath));
        const errors = prepared.issues.filter((issue) => issue.severity === "error");
        if (prepared.blueprint === undefined || errors.length > 0) {
            throw new Error(`Blueprint "${sourcePath}" cannot build a PAR workbook: ${errors.map((issue) => `${issue.code}: ${issue.message}${issue.suggestion ? ` Next: ${issue.suggestion}` : ""}`).join("; ")}`);
        }
        return prepared.blueprint;
    }

    private exportErrorMessage(sourcePath: string, destinationPath: string, errors: readonly {code: string; message: string}[]): string {
        return `Could not publish PAR workbook "${sourcePath}" to "${destinationPath}": ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`;
    }
}
