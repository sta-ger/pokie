import {
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    StakeEngineImporter,
    StakeEngineImporting,
    ValidationIssue,
    ValidationRule,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryValidator,
} from "pokie";
import fs from "fs";
import {loadOutcomeLibraryFromSelector, type LoadedOutcomeLibrary} from "./loadOutcomeLibraryFromSelector.js";
import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";

type LoadedLibrary = LoadedOutcomeLibrary;

// select()'s own "load + validate" half, factored out so a caller that needs the actual
// WeightedOutcomeLibrary object (not the select view's summary/sample) -- e.g. the Runtime tab's
// pre-generated handoff -- reuses the exact same resolution/validation path rather than a second one.
export type ResolvedOutcomeLibrary =
    | {readonly status: "ok"; readonly library: WeightedOutcomeLibrary<string>; readonly source: "json" | "bundle" | "stakeengine"}
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};

// The Runtime tab's pre-generated handoff, built directly on top of pokie's own
// WeightedOutcomeLibrary/OutcomeLibraryBundle/StakeEngine services -- resolves a selector (a plain JSON
// file / a bundle mode / a Stake Engine export mode) against the active project's root into a validated
// WeightedOutcomeLibrary. This class never computes RTP, hit rate, volatility, a payout distribution, or
// a feature/event breakdown itself; that analysis lives in Build/Export's own "Outcome libraries" card
// (see StudioOutcomeLibraryGenerateService) instead.
export class StudioOutcomeLibraryService {
    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly stakeEngineImporter: StakeEngineImporting<string>;
    private readonly libraryValidator: ValidationRule<WeightedOutcomeLibrary<string>>;
    private readonly readFile: (resolvedPath: string) => string;
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        stakeEngineImporter: StakeEngineImporting<string> = new StakeEngineImporter<string>(),
        libraryValidator: ValidationRule<WeightedOutcomeLibrary<string>> = new WeightedOutcomeLibraryValidator<string>(),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.bundleReader = bundleReader;
        this.stakeEngineImporter = stakeEngineImporter;
        this.libraryValidator = libraryValidator;
        this.readFile = readFile;
        this.realpath = realpath;
    }

    // The "load + validate" half of the old Select step -- resolves a selector all the way to a genuine,
    // validated WeightedOutcomeLibrary object, or a clear invalid/load-error result. This is what the
    // Runtime tab's pre-generated handoff calls: it never re-implements path resolution, bundle/Stake
    // Engine reading, or validation itself.
    public async resolveLibrary(projectRoot: string, selector: OutcomeLibrarySelector): Promise<ResolvedOutcomeLibrary> {
        const loaded = await this.loadLibrary(projectRoot, selector);
        if (loaded.status === "load-error") {
            return {status: "load-error", error: loaded.error};
        }

        try {
            const libraryIssues = this.libraryValidator.validate(loaded.library);
            const allIssues = [...loaded.importIssues, ...libraryIssues];
            const errors = allIssues.filter((issue) => issue.severity === "error");
            const warnings = allIssues.filter((issue) => issue.severity !== "error");

            if (errors.length > 0) {
                return {status: "invalid", errors, warnings};
            }

            return {status: "ok", library: loaded.library, source: loaded.source};
        } catch (error) {
            return {status: "load-error", error: `Could not validate the selected library: ${error instanceof Error ? error.message : String(error)}`};
        }
    }

    private loadLibrary(projectRoot: string, selector: OutcomeLibrarySelector): Promise<LoadedLibrary> {
        return loadOutcomeLibraryFromSelector(projectRoot, selector, this.bundleReader, this.stakeEngineImporter, this.readFile, this.realpath);
    }
}
