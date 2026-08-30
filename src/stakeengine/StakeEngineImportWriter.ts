import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineImportResult} from "./StakeEngineImportResult.js";
import type {StakeEngineImportWriting} from "./StakeEngineImportWriting.js";

// A reconstructed Stake export is a reusable Outcome Library first, with a small config.json companion
// that makes its modes immediately exportable to Stake again. Writing both through OutcomeLibraryBundleWriter
// means the directory public `inspect` and `validate` receive is a canonical, self-contained project rather
// than an unrecognized collection of otherwise-valid library JSON files.
export class StakeEngineImportWriter<T extends string | number = string> implements StakeEngineImportWriting<T> {
    private readonly bundleWriter: OutcomeLibraryBundleWriting<T>;

    constructor(
        pokieVersion = "unknown",
        bundleWriter: OutcomeLibraryBundleWriting<T> = new OutcomeLibraryBundleWriter<T>(pokieVersion),
    ) {
        this.bundleWriter = bundleWriter;
    }

    public async writeToDirectory(importResult: StakeEngineImportResult<T>, outDir: string): Promise<{issues: readonly ValidationIssue[]}> {
        const result = await this.bundleWriter.writeToDirectory(
            importResult.modes.map((mode) => ({
                modeName: mode.modeName,
                libraryId: mode.library.libraryId,
                schemaVersion: mode.library.schemaVersion,
                outcomes: mode.library.outcomes,
                ...(mode.generator === undefined ? {} : {generator: mode.generator}),
            })),
            outDir,
            {
                generatedBy: "pokie stakeengine import",
                supplementalFiles: [
                    {
                        fileName: "config.json",
                        contents: `${JSON.stringify({
                            ...(importResult.sourceProvenance === undefined ? {} : {sourceProvenance: importResult.sourceProvenance}),
                            modes: importResult.modes.map((mode) => ({
                                modeName: mode.modeName,
                                cost: mode.cost,
                                bundleDir: ".",
                                bundleModeName: mode.modeName,
                                ...(mode.generator === undefined ? {} : {generator: mode.generator}),
                            })),
                        }, null, 4)}\n`,
                    },
                    ...(importResult.sourceProvenance === undefined
                        ? []
                        : [{fileName: "source-provenance.json", contents: `${JSON.stringify(importResult.sourceProvenance, null, 4)}\n`}]),
                ],
            },
        );
        return {issues: result.issues};
    }
}
