import fs from "fs";
import path from "path";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import {computeBlueprintHash} from "../parsheet/computeBlueprintHash.js";
import type {ParSheetImporting} from "../parsheet/ParSheetImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactBuildNotCancelled, captureArtifactDestinationState, cleanupIncompleteArtifactOutput, ensureArtifactDestinationParent, reportArtifactBuildProgress, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import {PackageBlueprintExtraction, type PackageBlueprintExtractionResult} from "../generated/PackageBlueprintExtraction.js";
import {computeProjectInputBindingHash} from "./ArtifactConversionPlanner.js";
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
        if (source.type === "tsPackage") {
            const extracted = await new PackageBlueprintExtraction().extract(source.rootPath);
            this.assertComplete(extracted);
            return;
        }
        if (source.type !== "parWorkbook") throw new Error("A Blueprint destination requires a PAR workbook or a package with a complete public effective-model descriptor.");
        const imported = await this.importer.importFromFile(source.rootPath);
        const errors = imported.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) throw new Error(`Could not import PAR workbook "${source.rootPath}": ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        if (source.type !== "parWorkbook" && source.type !== "tsPackage") throw new Error("A Blueprint destination requires a PAR workbook or a package with a complete public effective-model descriptor.");
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const inputBinding = computeProjectInputBindingHash(source);
        await ensureArtifactDestinationParent(destinationPath);
        const state = captureArtifactDestinationState(destinationPath, this.destinationKind);
        const evidencePath = `${destinationPath}.conversion-evidence.json`;
        // Evidence is part of the Blueprint publication contract, not a
        // disposable log.  Do the same occupied-output check for it before
        // allocating either publication so an existing sidecar can never be
        // overwritten (or removed by the rollback below).
        assertArtifactDestinationIsSafe(source.rootPath, evidencePath);
        assertArtifactDestinationAvailable(evidencePath, this.destinationKind);
        const evidenceState = captureArtifactDestinationState(evidencePath, this.destinationKind);
        let blueprintTemp: string | undefined;
        let evidenceTemp: string | undefined;
        try {
            reportArtifactBuildProgress(options, {status: "running", message: source.type === "tsPackage" ? "Extracting public package model into Blueprint" : "Importing PAR workbook into Blueprint"});
            assertArtifactBuildNotCancelled(options);
            const extraction = source.type === "tsPackage" ? await new PackageBlueprintExtraction().extract(source.rootPath, {signal: options?.signal}) : undefined;
            if (extraction) this.assertComplete(extraction);
            const imported = extraction ? {blueprint: extraction.blueprint!, issues: [], provenance: undefined, conversionEvidence: undefined} : await this.importer.importFromFile(source.rootPath);
            const errors = imported.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0) throw new Error(`Could not import PAR workbook "${source.rootPath}": ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
            assertArtifactBuildNotCancelled(options);
            reportArtifactBuildProgress(options, {status: "running", message: "Publishing Blueprint and conversion evidence"});
            assertArtifactBuildNotCancelled(options);
            // Stage both members of the publication before exposing either
            // one.  A Blueprint without its evidence is not a successful PAR
            // import, and a cancellation between the two renames must take
            // the same rollback path as an importer or sidecar failure.
            const publicationId = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
            blueprintTemp = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${publicationId}.tmp`);
            evidenceTemp = path.join(path.dirname(evidencePath), `.${path.basename(evidencePath)}.${publicationId}.tmp`);
            await fs.promises.writeFile(blueprintTemp, `${JSON.stringify(imported.blueprint, null, 4)}\n`, "utf8");
            await fs.promises.writeFile(evidenceTemp, `${JSON.stringify(extraction ? {schemaVersion: 1, kind: "package-extraction", sourceBindingHash: inputBinding, extractedBlueprintHash: extraction.blueprintHash, extraction} : {
                schemaVersion: 1,
                sourceWorkbook: path.resolve(source.rootPath),
                provenance: imported.provenance,
                metaSheet: imported.conversionEvidence?.metaSheet,
                issues: imported.issues,
                facts: imported.conversionEvidence?.facts ?? imported.issues.map((issue) => ({kind: "diagnostic", code: issue.code, message: issue.message, ...(issue.details === undefined ? {} : {details: issue.details})})),
                losslessEligible: imported.conversionEvidence?.losslessEligible ?? false,
                // This is PAR's canonical representable-model hash: it is
                // deliberately the same value Meta provenance records and
                // therefore proves a lossless workbook round trip.  Studio's
                // exact-content comparison is performed separately at its
                // managed-save publication boundary.
                importedBlueprintHash: computeBlueprintHash(imported.blueprint),
                provenanceHashMatches: imported.conversionEvidence?.provenanceHashMatches ?? false,
            }, null, 4)}\n`, "utf8");
            assertArtifactBuildNotCancelled(options);
            if (inputBinding !== computeProjectInputBindingHash(source)) throw new Error("Package/PAR source changed during extraction; prepare a new conversion.");
            assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
            assertArtifactDestinationAvailable(evidencePath, this.destinationKind);
            await fs.promises.rename(blueprintTemp, destinationPath);
            assertArtifactBuildNotCancelled(options);
            await fs.promises.rename(evidenceTemp, evidencePath);
            assertArtifactBuildNotCancelled(options);
            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: destinationPath, conversionEvidencePath: evidencePath, ...(extraction ? {packageExtraction: extraction} : {})};
        } catch (error) {
            await Promise.all([
                ...(blueprintTemp === undefined ? [] : [fs.promises.rm(blueprintTemp, {force: true})]),
                ...(evidenceTemp === undefined ? [] : [fs.promises.rm(evidenceTemp, {force: true})]),
            ]);
            await cleanupIncompleteArtifactOutput(destinationPath, state);
            await cleanupIncompleteArtifactOutput(evidencePath, evidenceState);
            throw error;
        }
    }

    private assertComplete(result: PackageBlueprintExtractionResult): void {
        if (result.status !== "complete" || !result.blueprint) throw new Error(`Package extraction ${result.status}: ${result.diagnostics.map(issue => `${issue.path}: ${issue.code}: ${issue.message}`).join("; ")}`);
    }
}
