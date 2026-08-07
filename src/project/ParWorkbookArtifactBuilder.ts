import {ParSheetExporter} from "../parsheet/ParSheetExporter.js";
import type {ParSheetExporting} from "../parsheet/ParSheetExporting.js";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import type {ParSheetImporting} from "../parsheet/ParSheetImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import type {PokieProject} from "./PokieProject.js";

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

    constructor(
        pokieVersion: string,
        importer: ParSheetImporting = new ParSheetImporter(),
        exporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
    ) {
        this.importer = importer;
        this.exporter = exporter;
    }

    public async build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);

        const imported = await this.importer.importFromFile(source.rootPath);
        const importErrors = imported.issues.filter((issue) => issue.severity === "error");
        if (importErrors.length > 0) {
            throw new Error(
                `Could not read PAR sheet workbook "${source.rootPath}": ${importErrors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        const exportIssues = await this.exporter.exportToFile(imported.blueprint, destinationPath, source.rootPath);
        const exportErrors = exportIssues.filter((issue) => issue.severity === "error");
        if (exportErrors.length > 0) {
            throw new Error(
                `Could not republish PAR sheet workbook "${source.rootPath}" to "${destinationPath}": ${exportErrors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        return {outputPath: destinationPath};
    }
}
