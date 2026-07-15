import fs from "fs";
import path from "path";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import {buildWeightedOutcomeLibrary} from "../buildWeightedOutcomeLibrary.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import {iterateOutcomesJsonl} from "./internal/iterateOutcomesJsonl.js";
import {findIndexEntryById, readAndVerifyOutcomeAtByteRange} from "./internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "./internal/selectIndexEntryByCumulativeWeight.js";
import {OutcomeLibraryBundleInvariantError} from "./OutcomeLibraryBundleInvariantError.js";
import type {OutcomeLibraryBundleManifest} from "./OutcomeLibraryBundleManifest.js";
import type {OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleReading} from "./OutcomeLibraryBundleReading.js";

function isWeightedOutcomeShape(value: unknown): value is {id: string; weight: number; artifact: unknown} {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as {id?: unknown}).id === "string" &&
        typeof (value as {weight?: unknown}).weight === "number" &&
        typeof (value as {artifact?: unknown}).artifact === "object" &&
        (value as {artifact?: unknown}).artifact !== null
    );
}

// Reads a canonical outcome-library bundle back — see OutcomeLibraryBundleWriter for what it wrote. Assumes an
// already-valid bundle (see OutcomeLibraryBundleValidator for a bundle from an untrusted source) and throws
// (OutcomeLibraryBundleInvariantError, or whatever a malformed read naturally throws — a missing file, invalid
// JSON) rather than returning ValidationIssue[] — the same "assume already validated, fail fast on a genuine
// surprise" contract WeightedOutcomeSelector has toward WeightedOutcomeLibrary.
export class OutcomeLibraryBundleReader<T extends string | number = string> implements OutcomeLibraryBundleReading<T> {
    public async readManifest(bundleDir: string): Promise<OutcomeLibraryBundleManifest> {
        const raw = await fs.promises.readFile(path.join(bundleDir, "manifest.json"), "utf-8");
        return JSON.parse(raw) as OutcomeLibraryBundleManifest;
    }

    public async readModeIndex(bundleDir: string, modeName: string): Promise<OutcomeLibraryBundleModeIndex> {
        const raw = await fs.promises.readFile(path.join(bundleDir, `index_${modeName}.json`), "utf-8");
        return JSON.parse(raw) as OutcomeLibraryBundleModeIndex;
    }

    public async *iterateModeOutcomes(bundleDir: string, modeName: string): AsyncIterable<WeightedOutcome<T>> {
        const index = await this.readModeIndex(bundleDir, modeName);
        const outcomesPath = path.join(bundleDir, index.outcomesFile);
        for await (const line of iterateOutcomesJsonl(outcomesPath)) {
            if (line.status !== "ok") {
                throw new OutcomeLibraryBundleInvariantError(
                    `mode "${modeName}": outcomes line ${line.position} is not valid JSON (${line.error}). Validate the bundle first (OutcomeLibraryBundleValidator) before reading it this way.`,
                );
            }
            if (!isWeightedOutcomeShape(line.value)) {
                throw new OutcomeLibraryBundleInvariantError(
                    `mode "${modeName}": outcomes line ${line.position} is not {id, weight, artifact}. Validate the bundle first (OutcomeLibraryBundleValidator) before reading it this way.`,
                );
            }
            yield line.value as unknown as WeightedOutcome<T>;
        }
    }

    public async readOutcomeById(bundleDir: string, modeName: string, id: string): Promise<WeightedOutcome<T> | undefined> {
        const index = await this.readModeIndex(bundleDir, modeName);
        const entry = findIndexEntryById(index.entries, id);
        if (entry === undefined) {
            return undefined;
        }
        const outcomesPath = path.join(bundleDir, index.outcomesFile);
        return readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, entry);
    }

    public async drawOutcome(bundleDir: string, modeName: string, randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>> {
        const index = await this.readModeIndex(bundleDir, modeName);
        const winningEntry = selectIndexEntryByCumulativeWeight(modeName, index.entries, randomSource);
        const outcomesPath = path.join(bundleDir, index.outcomesFile);
        return readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, winningEntry);
    }

    public async readLibrary(bundleDir: string, modeName: string): Promise<WeightedOutcomeLibrary<T>> {
        const index = await this.readModeIndex(bundleDir, modeName);
        const outcomes: WeightedOutcome<T>[] = [];
        for await (const outcome of this.iterateModeOutcomes(bundleDir, modeName)) {
            outcomes.push(outcome);
        }
        return buildWeightedOutcomeLibrary<T>({libraryId: index.libraryId, outcomes, schemaVersion: index.librarySchemaVersion});
    }
}
