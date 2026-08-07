import {StakeEngineExporter} from "../stakeengine/StakeEngineExporter.js";
import type {StakeEngineExporting} from "../stakeengine/StakeEngineExporting.js";
import {StakeEngineImporter} from "../stakeengine/StakeEngineImporter.js";
import type {StakeEngineImporting} from "../stakeengine/StakeEngineImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import type {PokieProject} from "./PokieProject.js";

// (Re)publishes an already-exported "stakeAdapter" directory to a new destination, atomically -- reads it back
// with StakeEngineImporter (only ever round-trips a directory "pokie stakeengine export" itself produced) and
// feeds its own "modes" straight into StakeEngineExporter, which deliberately reuses StakeEngineExportModeInput
// as the importer's own result shape -- no field mapping happens here. Never re-derives or recomputes anything:
// this is a validated copy/republish, not a rebuild from a game model (see ArtifactBuilderRegistry's own
// "stakeAdapter" unsupportedNotes).
export class StakeAdapterArtifactBuilder implements ArtifactBuilder {
    public readonly target = "stakeAdapter";
    public readonly destinationKind = "directory";

    private readonly importer: StakeEngineImporting;
    private readonly exporter: StakeEngineExporting;

    constructor(
        pokieVersion: string,
        importer: StakeEngineImporting = new StakeEngineImporter(),
        exporter: StakeEngineExporting = new StakeEngineExporter(pokieVersion),
    ) {
        this.importer = importer;
        this.exporter = exporter;
    }

    public async build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);

        const imported = await this.importer.importFromDirectory(source.rootPath);
        const importErrors = imported.issues.filter((issue) => issue.severity === "error");
        if (importErrors.length > 0) {
            throw new Error(
                `Could not read Stake Engine export "${source.rootPath}": ${importErrors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        const result = await this.exporter.exportToDirectory(imported.modes, destinationPath);
        const exportErrors = result.issues.filter((issue) => issue.severity === "error");
        if (exportErrors.length > 0 || result.manifest === undefined) {
            throw new Error(
                `Could not republish Stake Engine export "${source.rootPath}" to "${destinationPath}": ${exportErrors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        return {outputPath: result.outDir};
    }
}
