import fs from "fs";
import path from "path";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {publishDirectoryAtomically} from "./internal/publishDirectoryAtomically.js";
import {resolveSafeStakeEngineFilePath} from "./internal/resolveSafeStakeEngineFilePath.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";
import type {StakeEngineImportWriting} from "./StakeEngineImportWriting.js";

// Writes a StakeEngineImportResult to disk in exactly the shape "pokie stakeengine export" reads back in —
// <outDir>/libraries/<modeName>.json per mode, a <outDir>/config.json naming them, and (when present) a
// <outDir>/source-provenance.json — atomically, via the same whole-directory temp-dir-then-swap discipline
// StakeEngineExporter uses (see publishDirectoryAtomically): a failure anywhere leaves an existing outDir
// completely untouched, and a re-write starts from nothing, so a mode no longer present in this result never
// leaves its old library file behind.
export class StakeEngineImportWriter<T extends string | number = string> implements StakeEngineImportWriting<T> {
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;

    constructor(
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
    ) {
        this.writeFile = writeFile;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
    }

    // Not "async" — same reasoning as StakeEngineExporter/StakeEngineImporter: synchronous fs work throughout,
    // still returns a Promise, still rejects rather than throws synchronously.
    public writeToDirectory(importResult: StakeEngineImportResult<T>, outDir: string): Promise<{issues: ValidationIssue[]}> {
        try {
            const {cleanupWarning} = publishDirectoryAtomically({
                outDir,
                renameDirectory: this.renameDirectory,
                removeDirectory: this.removeDirectory,
                writeFilesIntoTempDir: (tempDir) => this.writeFiles(tempDir, importResult),
            });

            const issues: ValidationIssue[] =
                cleanupWarning !== undefined
                    ? [{code: "stakeengine-import-write-stale-cleanup-failed", severity: "warning", message: cleanupWarning, details: {outDir}}]
                    : [];
            return Promise.resolve({issues});
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private writeFiles(tempDir: string, importResult: StakeEngineImportResult<T>): void {
        const librariesDir = path.join(tempDir, "libraries");
        fs.mkdirSync(librariesDir, {recursive: true});

        const modeEntries = importResult.modes.map((mode) => {
            // modeName is already restricted to [A-Za-z0-9_-]+ by StakeEngineImportValidator, but this writer
            // never trusts that alone: a hand-built StakeEngineImportResult (bypassing the importer) must still
            // never be able to write outside "libraries/" via a crafted modeName.
            const libraryFilePath = resolveSafeStakeEngineFilePath(librariesDir, `${mode.modeName}.json`);
            if (libraryFilePath === undefined) {
                throw new Error(`modeName "${mode.modeName}" is not safe to use as a filename.`);
            }
            this.writeFile(libraryFilePath, `${JSON.stringify(mode.library, null, 4)}\n`);
            return {modeName: mode.modeName, cost: mode.cost, libraryPath: `./libraries/${mode.modeName}.json`};
        });

        this.writeFile(path.join(tempDir, "config.json"), `${JSON.stringify({modes: modeEntries}, null, 4)}\n`);

        if (importResult.sourceProvenance !== undefined) {
            this.writeFile(path.join(tempDir, "source-provenance.json"), `${JSON.stringify(importResult.sourceProvenance, null, 4)}\n`);
        }
    }
}
