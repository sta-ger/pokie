import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";
import type {StakeEngineImportWriting} from "./StakeEngineImportWriting.js";

// Writes a StakeEngineImportResult as a canonical Outcome Library, plus the legacy re-export descriptor and
// source-provenance sidecars. All of it is published in one atomic directory swap by OutcomeLibraryBundleWriter:
// importing a Stake directory must yield an artifact that inspect/validate can consume immediately, without
// losing the previously advertised `config.json` route for a byte-for-byte Stake re-export.
export class StakeEngineImportWriter<T extends string | number = string> implements StakeEngineImportWriting<T> {
    private readonly bundleWriter: OutcomeLibraryBundleWriting<T>;

    constructor(pokieVersion?: string, bundleWriter?: OutcomeLibraryBundleWriting<T>);
    constructor(
        writeFile?: (filePath: string, contents: string) => void,
        renameDirectory?: (from: string, to: string) => void,
        removeDirectory?: (dirPath: string) => void,
    );
    constructor(
        pokieVersionOrWriteFile?: string | ((filePath: string, contents: string) => void),
        bundleWriterOrRenameDirectory?: OutcomeLibraryBundleWriting<T> | ((from: string, to: string) => void),
        removeDirectory?: (dirPath: string) => void,
    ) {
        if (
            typeof pokieVersionOrWriteFile === "string" ||
            (pokieVersionOrWriteFile === undefined && typeof bundleWriterOrRenameDirectory !== "function" && removeDirectory === undefined)
        ) {
            const pokieVersion = pokieVersionOrWriteFile ?? "unknown";
            this.bundleWriter = (bundleWriterOrRenameDirectory as OutcomeLibraryBundleWriting<T> | undefined) ?? new OutcomeLibraryBundleWriter<T>(pokieVersion);
            return;
        }

        // Retain the original fs-hook constructor for direct users and its atomic-publish failure coverage.
        // The hooks now configure the canonical bundle writer that owns the complete imported artifact.
        this.bundleWriter = new OutcomeLibraryBundleWriter<T>(
            "unknown",
            undefined,
            undefined,
            pokieVersionOrWriteFile,
            bundleWriterOrRenameDirectory as ((from: string, to: string) => void) | undefined,
            removeDirectory,
        );
    }

    public async writeToDirectory(importResult: StakeEngineImportResult<T>, outDir: string): Promise<{issues: ValidationIssue[]}> {
        const modeEntries = importResult.modes.map((mode) => ({modeName: mode.modeName, cost: mode.cost, libraryPath: `./libraries/${mode.modeName}.json`}));
        const additionalFiles = [
            {relativePath: "config.json", contents: `${JSON.stringify({modes: modeEntries}, null, 4)}\n`},
            ...importResult.modes.map((mode) => ({relativePath: `libraries/${mode.modeName}.json`, contents: `${JSON.stringify(mode.library, null, 4)}\n`})),
            ...(importResult.sourceProvenance === undefined ? [] : [{relativePath: "source-provenance.json", contents: `${JSON.stringify(importResult.sourceProvenance, null, 4)}\n`}]),
        ];
        const written = await this.bundleWriter.writeToDirectory(
            importResult.modes.map((mode) => ({modeName: mode.modeName, libraryId: mode.library.libraryId, outcomes: mode.library.outcomes})),
            outDir,
            {additionalFiles},
        );
        return {
            issues: written.issues.map((issue) =>
                issue.code === "outcome-library-bundle-write-stale-cleanup-failed"
                    ? {code: "stakeengine-import-write-stale-cleanup-failed", severity: issue.severity, message: issue.message, details: issue.details}
                    : issue,
            ),
        };
    }
}
