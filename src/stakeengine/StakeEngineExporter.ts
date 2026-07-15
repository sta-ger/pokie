import fs from "fs";
import path from "path";
import type {RoundArtifactProjector} from "../artifact/RoundArtifactProjector.js";
import {writeFileAtomically} from "../parsheet/writeFileAtomically.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import {assertSafeToRebuildStakeEngineExport} from "./internal/assertSafeToRebuildStakeEngineExport.js";
import {compressStakeEngineBooksJsonl} from "./internal/compressStakeEngineBooksJsonl.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import {renderStakeEngineLookupCsv} from "./internal/renderStakeEngineLookupCsv.js";
import type {StakeEngineBookLine} from "./StakeEngineBookLine.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import {StakeEngineExportInvariantError} from "./StakeEngineExportInvariantError.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineExporting} from "./StakeEngineExporting.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";
import type {StakeEngineExportValidating} from "./StakeEngineExportValidating.js";
import {StakeEngineExportValidator} from "./StakeEngineExportValidator.js";
import type {StakeEngineIndex} from "./StakeEngineIndex.js";
import {STAKE_ENGINE_MANIFEST_SCHEMA_VERSION, type StakeEngineManifest, type StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";
import {StakeEngineRoundEventsProjector} from "./StakeEngineRoundEventsProjector.js";

const GENERATED_BY = "pokie stakeengine export";

type BuiltMode = {
    readonly csvFileName: string;
    readonly booksFileName: string;
    readonly csvContent: string;
    readonly booksBuffer: Buffer;
    readonly manifestEntry: StakeEngineManifestModeEntry;
};

// Exports one or more canonical WeightedOutcomeLibrary instances (one per Stake "mode") to the real Stake
// Engine math-sdk static file format (see https://stakeengine.github.io/math-sdk/rgs_docs/data_format/):
// index.json (Stake's own strict shape), a per-mode lookup CSV, and per-mode zstd-compressed JSONL books — plus
// a sibling pokie-manifest.json carrying POKIE's own provenance (index.json itself never gets extra fields).
// Never a second calculation path: every number written here already exists on the library's own outcomes/
// artifacts, re-shaped, not recomputed.
export class StakeEngineExporter<T extends string | number = string> implements StakeEngineExporting<T> {
    private readonly pokieVersion: string;
    private readonly validator: StakeEngineExportValidating<T>;
    private readonly eventsProjector: RoundArtifactProjector<T, readonly StakeEngineEvent[]>;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, write: (tempPath: string) => Promise<void>) => Promise<void>;

    constructor(
        pokieVersion: string,
        validator: StakeEngineExportValidating<T> = new StakeEngineExportValidator<T>(),
        eventsProjector: RoundArtifactProjector<T, readonly StakeEngineEvent[]> = new StakeEngineRoundEventsProjector<T>(),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, write: (tempPath: string) => Promise<void>) => Promise<void> = writeFileAtomically,
    ) {
        this.pokieVersion = pokieVersion;
        this.validator = validator;
        this.eventsProjector = eventsProjector;
        this.now = now;
        this.writeFile = writeFile;
    }

    // Runs full validation itself (StakeEngineExportValidator, which always runs WeightedOutcomeLibraryValidator
    // against every mode's library first) — the caller never needs to validate first. Preflights the entire
    // export in memory before touching the filesystem at all: on any validation error, nothing is written and
    // an existing outDir is left completely untouched. There is no partial export.
    public async exportToDirectory(modes: readonly StakeEngineExportModeInput<T>[], outDir: string): Promise<StakeEngineExportResult> {
        const issues = this.validator.validate(modes);
        if (issues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues};
        }

        const builtModes = modes.map((mode) => this.buildMode(mode));

        const index: StakeEngineIndex = {
            modes: modes.map((mode, position) => ({
                name: mode.modeName,
                cost: mode.cost,
                events: builtModes[position].booksFileName,
                weights: builtModes[position].csvFileName,
            })),
        };

        const relativeFiles = [
            ...builtModes.flatMap((builtMode) => [builtMode.csvFileName, builtMode.booksFileName]),
            "index.json",
            "pokie-manifest.json",
        ];

        const firstOutcome = modes[0].library.outcomes[0];
        const manifest: StakeEngineManifest = {
            schemaVersion: STAKE_ENGINE_MANIFEST_SCHEMA_VERSION,
            generatedBy: GENERATED_BY,
            pokieVersion: this.pokieVersion,
            generatedAt: this.now().toISOString(),
            game: firstOutcome.artifact.provenance.game,
            configHash: firstOutcome.artifact.provenance.configHash,
            modes: builtModes.map((builtMode) => builtMode.manifestEntry),
            files: relativeFiles,
        };

        if (fs.existsSync(outDir)) {
            assertSafeToRebuildStakeEngineExport(outDir, relativeFiles);
        }
        fs.mkdirSync(outDir, {recursive: true});

        for (const builtMode of builtModes) {
            await this.writeFile(path.join(outDir, builtMode.csvFileName), (tempPath) =>
                fs.promises.writeFile(tempPath, builtMode.csvContent, "utf-8"),
            );
            await this.writeFile(path.join(outDir, builtMode.booksFileName), (tempPath) => fs.promises.writeFile(tempPath, builtMode.booksBuffer));
        }
        await this.writeFile(path.join(outDir, "index.json"), (tempPath) =>
            fs.promises.writeFile(tempPath, `${JSON.stringify(index, null, 4)}\n`, "utf-8"),
        );
        await this.writeFile(path.join(outDir, "pokie-manifest.json"), (tempPath) =>
            fs.promises.writeFile(tempPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf-8"),
        );

        return {outDir, files: relativeFiles, manifest, issues};
    }

    // Builds one mode's CSV/books content fully in memory (no disk access) — the same in-order pass produces
    // both the lookup CSV rows and the book lines, then cross-checks them against each other before returning,
    // so a divergence between the two (which should be impossible, since both come from the same outcome's
    // artifact.payoutMultiplier) is caught as an invariant failure rather than written to disk.
    private buildMode(mode: StakeEngineExportModeInput<T>): BuiltMode {
        const bookLines: StakeEngineBookLine[] = mode.library.outcomes.map((outcome) => {
            const id = parseStakeEngineOutcomeId(outcome.id);
            if (id === undefined) {
                // Unreachable once StakeEngineExportValidator has run without errors (it rejects any outcome
                // id that doesn't already parse this way) — guarded rather than cast, since buildMode has no
                // way to know validation actually ran.
                throw new StakeEngineExportInvariantError(`mode "${mode.modeName}": outcome id "${outcome.id}" is not a valid Stake Engine integer id.`);
            }
            return {id, events: this.eventsProjector.project(outcome.artifact), payoutMultiplier: outcome.artifact.payoutMultiplier};
        });

        const csvRows = mode.library.outcomes.map((outcome, position) => ({
            simulationId: bookLines[position].id,
            weight: outcome.weight,
            payoutMultiplier: outcome.artifact.payoutMultiplier,
        }));

        csvRows.forEach((row, position) => {
            if (row.payoutMultiplier !== bookLines[position].payoutMultiplier) {
                throw new StakeEngineExportInvariantError(
                    `mode "${mode.modeName}": lookup CSV payoutMultiplier (${row.payoutMultiplier}) does not match the book line's ` +
                        `payoutMultiplier (${bookLines[position].payoutMultiplier}) at position ${position}.`,
                );
            }
        });

        const firstOutcome = mode.library.outcomes[0];
        const manifestEntry: StakeEngineManifestModeEntry = {
            name: mode.modeName,
            betMode: firstOutcome.artifact.betMode,
            stake: firstOutcome.artifact.stake,
            cost: mode.cost,
            outcomeCount: mode.library.outcomes.length,
            libraryId: mode.library.libraryId,
            libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
            events: `books_${mode.modeName}.jsonl.zst`,
            weights: `lookup_${mode.modeName}.csv`,
        };

        return {
            csvFileName: manifestEntry.weights,
            booksFileName: manifestEntry.events,
            csvContent: renderStakeEngineLookupCsv(csvRows),
            booksBuffer: compressStakeEngineBooksJsonl(bookLines),
            manifestEntry,
        };
    }
}
