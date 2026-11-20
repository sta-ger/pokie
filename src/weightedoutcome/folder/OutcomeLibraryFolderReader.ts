import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import {buildWeightedOutcomeLibrary} from "../buildWeightedOutcomeLibrary.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import {iterateOutcomesJsonl} from "./internal/iterateOutcomesJsonl.js";
import {findIndexEntryById, readAndVerifyOutcomeAtByteRange} from "./internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "./internal/selectIndexEntryByCumulativeWeight.js";
import {OutcomeLibraryFolderInvariantError} from "./OutcomeLibraryFolderInvariantError.js";
import type {OutcomeLibraryFolderIndex} from "./OutcomeLibraryFolderIndex.js";
import type {OutcomeLibraryFolderModeIndex} from "./OutcomeLibraryFolderModeIndex.js";
import type {OutcomeLibraryFolderReading} from "./OutcomeLibraryFolderReading.js";

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

// Reads a canonical outcome-library bundle back — see OutcomeLibraryFolderWriter for what it wrote. Assumes an
// already-valid bundle (see OutcomeLibraryFolderValidator for a bundle from an untrusted source) and throws
// (OutcomeLibraryFolderInvariantError, or whatever a malformed read naturally throws — a missing file, invalid
// JSON) rather than returning ValidationIssue[] — the same "assume already validated, fail fast on a genuine
// surprise" contract WeightedOutcomeSelector has toward WeightedOutcomeLibrary.
export class OutcomeLibraryFolderReader<T extends string | number = string> implements OutcomeLibraryFolderReading<T> {
    public async readManifest(libraryDir: string): Promise<OutcomeLibraryFolderIndex> {
        const raw = await fs.promises.readFile(path.join(libraryDir, "index.json"), "utf-8");
        return JSON.parse(raw) as OutcomeLibraryFolderIndex;
    }

    public async readModeIndex(libraryDir: string, modeName: string): Promise<OutcomeLibraryFolderModeIndex> {
        const raw = await fs.promises.readFile(path.join(libraryDir, `index_${modeName}.json`), "utf-8");
        return JSON.parse(raw) as OutcomeLibraryFolderModeIndex;
    }

    public async *iterateModeOutcomes(libraryDir: string, modeName: string): AsyncIterable<WeightedOutcome<T>> {
        const index = await this.readModeIndex(libraryDir, modeName);
        const outcomesPath = path.join(libraryDir, index.outcomesFile);
        const libraryHash = crypto.createHash("sha256");
        libraryHash.update(`{"libraryId":${JSON.stringify(index.libraryId)},"outcomes":[`);
        let entryPosition = 0;
        let totalWeight = 0;
        for await (const line of iterateOutcomesJsonl(outcomesPath)) {
            if (line.status !== "ok") {
                throw new OutcomeLibraryFolderInvariantError(
                    `mode "${modeName}": outcomes line ${line.position} is not valid JSON (${line.error}). Validate the bundle first (OutcomeLibraryFolderValidator) before reading it this way.`,
                );
            }
            if (!isWeightedOutcomeShape(line.value)) {
                throw new OutcomeLibraryFolderInvariantError(
                    `mode "${modeName}": outcomes line ${line.position} is not {id, weight, artifact}. Validate the bundle first (OutcomeLibraryFolderValidator) before reading it this way.`,
                );
            }
            const outcome = line.value as unknown as WeightedOutcome<T>;
            const entry = index.entries[entryPosition];
            const raw = Buffer.from(line.raw, "utf-8");
            const recordHash = `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
            if (
                entry === undefined ||
                entry.id !== outcome.id ||
                entry.weight !== outcome.weight ||
                entry.byteOffset !== line.byteOffset ||
                entry.byteLength !== raw.byteLength ||
                entry.recordHash !== recordHash
            ) {
                throw new OutcomeLibraryFolderInvariantError(
                    `mode "${modeName}": outcome "${outcome.id}" no longer matches its original index entry. Refusing to reuse a corrupted retained mode.`,
                );
            }
            if (entryPosition > 0) libraryHash.update(",");
            libraryHash.update(raw);
            entryPosition++;
            totalWeight += outcome.weight;
            yield outcome;
        }
        libraryHash.update(`],"schemaVersion":${JSON.stringify(index.librarySchemaVersion)}}`);
        const computedLibraryHash = `sha256:${libraryHash.digest("hex")}`;
        if (entryPosition !== index.outcomeCount || totalWeight !== index.totalWeight || computedLibraryHash !== index.libraryHash) {
            throw new OutcomeLibraryFolderInvariantError(
                `mode "${modeName}": retained outcomes do not match the original index count, weight, or library hash. Refusing to reuse a corrupted mode.`,
            );
        }
    }

    public async readOutcomeById(libraryDir: string, modeName: string, id: string): Promise<WeightedOutcome<T> | undefined> {
        const index = await this.readModeIndex(libraryDir, modeName);
        const entry = findIndexEntryById(index.entries, id);
        if (entry === undefined) {
            return undefined;
        }
        const outcomesPath = path.join(libraryDir, index.outcomesFile);
        return readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, entry);
    }

    public async drawOutcome(libraryDir: string, modeName: string, randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>> {
        const index = await this.readModeIndex(libraryDir, modeName);
        const winningEntry = selectIndexEntryByCumulativeWeight(modeName, index.entries, randomSource);
        const outcomesPath = path.join(libraryDir, index.outcomesFile);
        return readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, winningEntry);
    }

    public async readLibrary(libraryDir: string, modeName: string): Promise<WeightedOutcomeLibrary<T>> {
        const index = await this.readModeIndex(libraryDir, modeName);
        const outcomes: WeightedOutcome<T>[] = [];
        for await (const outcome of this.iterateModeOutcomes(libraryDir, modeName)) {
            outcomes.push(outcome);
        }
        return buildWeightedOutcomeLibrary<T>({libraryId: index.libraryId, outcomes, schemaVersion: index.librarySchemaVersion});
    }
}
