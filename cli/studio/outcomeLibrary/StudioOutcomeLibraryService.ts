import {
    computeWeightedOutcomeLibraryFeatureBreakdown,
    computeWeightedOutcomeLibraryHash,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    StakeEngineImporter,
    StakeEngineImporting,
    ValidationIssue,
    ValidationRule,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryAnalysisDiffer,
    WeightedOutcomeLibraryAnalysisDiffing,
    WeightedOutcomeLibraryAnalyzer,
    WeightedOutcomeLibraryValidator,
} from "pokie";
import fs from "fs";
import {loadWeightedOutcomeLibraryFromProjectFile} from "../deployment/loadWeightedOutcomeLibraryFromProjectFile.js";
import {resolveProjectDirectory} from "./resolveProjectDirectory.js";
import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";
import type {StudioOutcomeLibraryCompareView} from "./StudioOutcomeLibraryCompareView.js";
import type {StudioOutcomeLibraryDeepValidateView} from "./StudioOutcomeLibraryDeepValidateView.js";
import type {StudioOutcomeLibrarySelectView} from "./StudioOutcomeLibrarySelectView.js";

type LoadedLibrary =
    | {
          readonly status: "ok";
          readonly library: WeightedOutcomeLibrary<string>;
          readonly source: "json" | "bundle" | "stakeengine";
          readonly envelope?: {readonly game: {id: string; name: string; version: string}; readonly configHash?: string; readonly pokieVersion: string};
          readonly importIssues: readonly ValidationIssue[];
      }
    | {readonly status: "load-error"; readonly error: string};

// The Project Dashboard's Outcome Libraries tab, built directly on top of pokie's own
// WeightedOutcomeLibrary/OutcomeLibraryBundle/StakeEngine services -- this class never computes RTP, hit
// rate, volatility, a payout distribution, or a feature/event breakdown itself; every one of those is
// delegated straight to WeightedOutcomeLibraryAnalyzer / computeWeightedOutcomeLibraryFeatureBreakdown /
// WeightedOutcomeLibraryAnalysisDiffer. What this class actually owns is Studio-specific plumbing only:
// resolving a selector (a plain JSON file / a bundle mode / a Stake Engine export mode) against the active
// project's root, and shaping the result into a "select"/"compare"/deep-validate view.
export class StudioOutcomeLibraryService {
    private static readonly SAMPLE_SIZE = 20;

    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly bundleValidator: OutcomeLibraryBundleValidating;
    private readonly stakeEngineImporter: StakeEngineImporting<string>;
    private readonly libraryValidator: ValidationRule<WeightedOutcomeLibrary<string>>;
    private readonly analyzer: WeightedOutcomeLibraryAnalyzer<string>;
    private readonly differ: WeightedOutcomeLibraryAnalysisDiffing;
    private readonly readFile: (resolvedPath: string) => string;
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        bundleValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator<string>(),
        stakeEngineImporter: StakeEngineImporting<string> = new StakeEngineImporter<string>(),
        libraryValidator: ValidationRule<WeightedOutcomeLibrary<string>> = new WeightedOutcomeLibraryValidator<string>(),
        analyzer: WeightedOutcomeLibraryAnalyzer<string> = new WeightedOutcomeLibraryAnalyzer<string>(),
        differ: WeightedOutcomeLibraryAnalysisDiffing = new WeightedOutcomeLibraryAnalysisDiffer(),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.bundleReader = bundleReader;
        this.bundleValidator = bundleValidator;
        this.stakeEngineImporter = stakeEngineImporter;
        this.libraryValidator = libraryValidator;
        this.analyzer = analyzer;
        this.differ = differ;
        this.readFile = readFile;
        this.realpath = realpath;
    }

    // Select/import -> Validate & analyze -> Inspect distribution/features all land in one call: once a
    // library is loaded, diagnostics/analysis/feature breakdown are fast and deterministic, unlike deep
    // bundle validation (see validateBundleDeep), which is genuinely expensive and stays opt-in.
    public async select(projectRoot: string, selector: OutcomeLibrarySelector): Promise<StudioOutcomeLibrarySelectView> {
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

            const analysis = this.analyzer.analyze(loaded.library);
            const featureBreakdown = computeWeightedOutcomeLibraryFeatureBreakdown(loaded.library);
            const hash = computeWeightedOutcomeLibraryHash(loaded.library);
            const sampleOutcomes = loaded.library.outcomes.slice(0, StudioOutcomeLibraryService.SAMPLE_SIZE).map((outcome) => ({
                id: outcome.id,
                weight: outcome.weight,
                totalWin: outcome.artifact.totalWin,
                payoutMultiplier: outcome.artifact.payoutMultiplier,
            }));

            return {
                status: "ok",
                provenance: {
                    source: loaded.source,
                    libraryId: loaded.library.libraryId,
                    outcomeCount: loaded.library.outcomes.length,
                    hash,
                    ...(loaded.envelope !== undefined
                        ? {game: loaded.envelope.game, configHash: loaded.envelope.configHash, pokieVersion: loaded.envelope.pokieVersion}
                        : {}),
                },
                errors,
                warnings,
                analysis,
                featureBreakdown,
                sampleOutcomes,
                sampleTruncated: loaded.library.outcomes.length > StudioOutcomeLibraryService.SAMPLE_SIZE,
            };
        } catch (error) {
            return {status: "load-error", error: `Could not analyze the selected library: ${error instanceof Error ? error.message : String(error)}`};
        }
    }

    public async compare(projectRoot: string, left: OutcomeLibrarySelector, right: OutcomeLibrarySelector): Promise<StudioOutcomeLibraryCompareView> {
        const [leftView, rightView] = await Promise.all([this.select(projectRoot, left), this.select(projectRoot, right)]);
        if (leftView.status !== "ok" || rightView.status !== "ok") {
            return {left: leftView, right: rightView};
        }
        return {left: leftView, right: rightView, diff: this.differ.diff(leftView.analysis, rightView.analysis)};
    }

    public async validateBundleDeep(projectRoot: string, bundleDir: string, modeName: string): Promise<StudioOutcomeLibraryDeepValidateView> {
        const resolved = resolveProjectDirectory(projectRoot, bundleDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        try {
            const manifest = await this.bundleReader.readManifest(resolved.resolvedPath);
            if (!manifest.modes.some((mode) => mode.modeName === modeName)) {
                return {status: "load-error", error: `Mode "${modeName}" was not found in bundle "${bundleDir}".`};
            }
            const issues = await this.bundleValidator.validate(resolved.resolvedPath, {deep: true});
            return {
                status: "ok",
                errors: issues.filter((issue) => issue.severity === "error"),
                warnings: issues.filter((issue) => issue.severity !== "error"),
            };
        } catch (error) {
            return {status: "load-error", error: `Could not deep-validate bundle "${bundleDir}": ${error instanceof Error ? error.message : String(error)}`};
        }
    }

    private async loadLibrary(projectRoot: string, selector: OutcomeLibrarySelector): Promise<LoadedLibrary> {
        if (selector.kind === "json") {
            const loaded = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, selector.path, this.readFile, this.realpath);
            if (loaded.status === "error") {
                return {status: "load-error", error: loaded.message};
            }
            return {status: "ok", library: loaded.library, source: "json", importIssues: []};
        }

        if (selector.kind === "bundle") {
            const resolved = resolveProjectDirectory(projectRoot, selector.bundleDir, this.realpath);
            if (resolved.status === "error") {
                return {status: "load-error", error: resolved.message};
            }
            try {
                const manifest = await this.bundleReader.readManifest(resolved.resolvedPath);
                const library = await this.bundleReader.readLibrary(resolved.resolvedPath, selector.modeName);
                return {
                    status: "ok",
                    library,
                    source: "bundle",
                    envelope: {game: manifest.game, configHash: manifest.configHash, pokieVersion: manifest.artifactPokieVersion},
                    importIssues: [],
                };
            } catch (error) {
                return {
                    status: "load-error",
                    error: `Could not read bundle "${selector.bundleDir}" mode "${selector.modeName}": ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        }

        const resolved = resolveProjectDirectory(projectRoot, selector.stakeDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        let imported;
        try {
            imported = await this.stakeEngineImporter.importFromDirectory(resolved.resolvedPath);
        } catch (error) {
            return {status: "load-error", error: `Could not read Stake Engine export "${selector.stakeDir}": ${error instanceof Error ? error.message : String(error)}`};
        }
        const importErrors = imported.issues.filter((issue) => issue.severity === "error");
        if (importErrors.length > 0) {
            return {status: "load-error", error: importErrors.map((issue) => issue.message).join(" ")};
        }
        const mode = imported.modes.find((candidate) => candidate.modeName === selector.modeName);
        if (mode === undefined) {
            return {status: "load-error", error: `Mode "${selector.modeName}" was not found in Stake Engine export "${selector.stakeDir}".`};
        }
        return {
            status: "ok",
            library: mode.library,
            source: "stakeengine",
            envelope:
                imported.manifest !== undefined
                    ? {game: imported.manifest.game, configHash: imported.manifest.configHash, pokieVersion: imported.manifest.pokieVersion}
                    : undefined,
            importIssues: imported.issues,
        };
    }
}
