import {parSheetConversionReport} from "../parsheet/ParSheetConversionReport.js";
import {rollbackArtifactPublication} from "./ArtifactPublicationOwnership.js";
import {ParSheetExporter, inspectParSheetConversion, prepareBlueprintForParSheetExport} from "../parsheet/ParSheetExporter.js";
import type {ParSheetExporting, ParSheetFilePublication} from "../parsheet/ParSheetExporting.js";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import type {ParSheetImporting} from "../parsheet/ParSheetImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {
    assertArtifactBuildNotCancelled,
    ArtifactBuildCancelledError,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";

// Exports a canonical Blueprint as a deterministic PAR workbook snapshot, or republishes an already-exported
// "parWorkbook" .xlsx file to a new destination. Workbook republish reads the source with ParSheetImporter
// and re-exports its resulting GameBlueprint through ParSheetExporter, exactly as the PAR round-trip tests
// exercise. Blueprint export materializes its valid canonical reel representation without changing the
// authored source; both paths use ParSheetExporter and preserve atomic destination safety.
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

    public async inspectConversion(source: PokieProject) {
        if (source.type === "blueprint") return inspectParSheetConversion(this.loadBlueprint(source.rootPath), source.rootPath);
        const imported = await this.importer.importFromFile(source.rootPath);
        return inspectParSheetConversion(imported.blueprint, undefined, {conversionReport: parSheetConversionReport(imported.issues, imported.conversionEvidence ?? {issues: [], facts: [], losslessEligible: false}), losslessEligible: imported.conversionEvidence?.losslessEligible ?? false});
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
        let publication: ParSheetFilePublication | undefined;

        try {
            reportArtifactBuildProgress(options, {status: "running", message: "Reading PAR workbook"});
            if (source.type === "blueprint") {
                reportArtifactBuildProgress(options, {status: "running", message: "Preparing Blueprint reel source for PAR workbook"});
                this.assertBlueprintCanExport(source.rootPath);
                reportArtifactBuildProgress(options, {status: "running", message: "Publishing PAR workbook"});
                const conversion = await this.inspectConversion(source);
                const exportIssues = await this.exporter.exportToFile(this.loadBlueprint(source.rootPath), destinationPath, source.rootPath, {
                    signal: options?.signal,
                    onPublication: owned => {
                        publication = owned;
                    },
                    onProgress: (progress) => reportArtifactBuildProgress(options, {status: "running", message: progress.message}),
                });
                const exportErrors = exportIssues.filter((issue) => issue.severity === "error");
                if (exportErrors.length > 0) throw new Error(this.exportErrorMessage(source.rootPath, destinationPath, exportErrors));
                assertArtifactBuildNotCancelled(options);
                reportArtifactBuildProgress(options, {status: "completed"});
                return {outputPath: destinationPath, publishedFileOwnership: publication === undefined ? [] : [publication], parConversion: parSheetConversionReport(exportIssues, conversion)};
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
                losslessEligible: imported.conversionEvidence?.losslessEligible ?? false,
                conversionReport: parSheetConversionReport(imported.issues, imported.conversionEvidence ?? {issues: [], facts: [], losslessEligible: false}),
                onPublication: owned => {
                    publication = owned;
                },
                signal: options?.signal,
                onProgress: (progress) => reportArtifactBuildProgress(options, {status: "running", message: progress.message}),
            });
            assertArtifactBuildNotCancelled(options);
            const exportErrors = exportIssues.filter((issue) => issue.severity === "error");
            if (exportErrors.length > 0) {
                throw new Error(this.exportErrorMessage(source.rootPath, destinationPath, exportErrors));
            }

            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath, publishedFileOwnership: publication === undefined ? [] : [publication], parConversion: parSheetConversionReport([...imported.issues, ...exportIssues], imported.conversionEvidence ?? {issues: [], facts: [], losslessEligible: false})};
        } catch (error) {
            await rollbackArtifactPublication({publishedFileOwnership: publication === undefined ? [] : [publication]});
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
