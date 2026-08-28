import fs from "fs";
import path from "path";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import type {ParSheetImporting} from "../parsheet/ParSheetImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactBuildNotCancelled, captureArtifactDestinationState, cleanupIncompleteArtifactOutput, reportArtifactBuildProgress, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";

/** Materializes PAR's canonical game-model import as a resolver-recognizable Blueprint file. */
export class BlueprintArtifactBuilder implements ArtifactBuilder {
    public readonly target = "blueprint" as const;
    public readonly destinationKind = "file" as const;
    private readonly importer: ParSheetImporting;

    public constructor(importer: ParSheetImporting = new ParSheetImporter()) {
        this.importer = importer;
    }

    public async validate(source: PokieProject): Promise<void> {
        if (source.type !== "parWorkbook") throw new Error("A Blueprint destination requires a PAR workbook that can import a game model.");
        const imported = await this.importer.importFromFile(source.rootPath);
        const errors = imported.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) throw new Error(`Could not import PAR workbook "${source.rootPath}": ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        if (source.type !== "parWorkbook") throw new Error("A Blueprint destination requires a PAR workbook that can import a game model.");
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const state = captureArtifactDestinationState(destinationPath, this.destinationKind);
        const evidencePath = `${destinationPath}.conversion-evidence.json`;
        // Evidence is part of the Blueprint publication contract, not a
        // disposable log.  Do the same occupied-output check for it before
        // allocating either publication so an existing sidecar can never be
        // overwritten (or removed by the rollback below).
        assertArtifactDestinationAvailable(evidencePath, this.destinationKind);
        const evidenceState = captureArtifactDestinationState(evidencePath, this.destinationKind);
        try {
            reportArtifactBuildProgress(options, {status: "running", message: "Importing PAR workbook into Blueprint"});
            assertArtifactBuildNotCancelled(options);
            const imported = await this.importer.importFromFile(source.rootPath);
            const errors = imported.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0) throw new Error(`Could not import PAR workbook "${source.rootPath}": ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
            assertArtifactBuildNotCancelled(options);
            reportArtifactBuildProgress(options, {status: "running", message: "Publishing imported Blueprint and conversion evidence"});
            assertArtifactBuildNotCancelled(options);
            const temp = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${process.pid}.${Date.now()}.tmp`);
            await fs.promises.writeFile(temp, `${JSON.stringify(imported.blueprint, null, 4)}\n`, "utf8");
            await fs.promises.rename(temp, destinationPath);
            await fs.promises.writeFile(evidencePath, `${JSON.stringify({
                schemaVersion: 1,
                sourceWorkbook: path.resolve(source.rootPath),
                provenance: imported.provenance,
                metaSheet: imported.conversionEvidence?.metaSheet,
                issues: imported.issues,
                facts: imported.conversionEvidence?.facts ?? imported.issues.map((issue) => ({kind: "diagnostic", code: issue.code, message: issue.message, ...(issue.details === undefined ? {} : {details: issue.details})})),
                losslessEligible: imported.conversionEvidence?.losslessEligible ?? false,
                importedBlueprintHash: imported.conversionEvidence?.importedBlueprintHash,
                provenanceHashMatches: imported.conversionEvidence?.provenanceHashMatches ?? false,
            }, null, 4)}\n`, "utf8");
            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath, conversionEvidencePath: evidencePath};
        } catch (error) {
            await cleanupIncompleteArtifactOutput(destinationPath, state);
            await cleanupIncompleteArtifactOutput(evidencePath, evidenceState);
            throw error;
        }
    }
}
