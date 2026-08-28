import {
    computeWeightedOutcomeLibraryHash,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    StakeEngineExporter,
    StakeEngineExporting,
    StakeEngineExportModeInput,
    StakeEngineExportValidating,
    StakeEngineExportValidator,
    StakeEngineImporter,
    StakeEngineImporting,
    describeArtifactConversionPlanDiagnostic,
} from "pokie";
import fs from "fs";
import path from "path";
import {loadOutcomeLibraryFromSelector} from "../outcomeLibrary/loadOutcomeLibraryFromSelector.js";
import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import {canonicalizeOutcomeIdsForStakeEngine} from "./canonicalizeOutcomeIdsForStakeEngine.js";
import {StudioArtifactConversionPlanning, StudioArtifactConversionPlanningService} from "../artifacts/StudioArtifactConversionPlanningService.js";
import {createExternalOutcomeLibraryPlan} from "../artifacts/createExternalArtifactConversionPlan.js";
import {describePreparedArtifactPlanDrift} from "../artifacts/describePreparedArtifactPlanDrift.js";
import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";
import type {StudioStakeEngineExportValidateView} from "./StudioStakeEngineExportValidateView.js";
import type {StudioStakeEngineExportView} from "./StudioStakeEngineExportView.js";

type LoadModesResult =
    | {readonly status: "ok"; readonly loaded: readonly StakeEngineExportModeInput<string>[]}
    | {readonly status: "load-error"; readonly error: string};

// A bundle/Stake Engine selector carries its own "modeName" (which mode of the bundle/export to read --
// see OutcomeLibrarySelector); a "json" selector has no such field. Mismatched against the export row's
// own mode would silently export one mode's data under another mode's name, so this is checked -- and
// rejected -- before any selector is ever resolved to a real library. Mirrors
// StudioDeploymentService's own selectorModeName/describeSelectorModeMismatch.
function selectorModeName(selector: OutcomeLibrarySelector): string | undefined {
    return selector.kind === "json" ? undefined : selector.modeName;
}

function describeSelectorModeMismatch(modeName: string, mismatchedModeName: string): string {
    return (
        `mode "${modeName}"'s library selector names mode "${mismatchedModeName}" -- a bundle/Stake Engine ` +
        "selector must name the exact same mode as its own export row."
    );
}

// The Project Dashboard's Stake Engine Export tab, built directly on top of pokie's own
// StakeEngineExporter/StakeEngineExportValidator (see docs/stake-engine-export.md) — this class never
// converts a payoutMultiplier into Stake units, renders a lookup CSV, computes a library hash, or
// re-implements the exporter's own atomic-directory-replace/"no partial export" contracts; it only
// resolves each mode's own librarySelector (the same loadOutcomeLibraryFromSelector the Deployment tab
// already uses), relabels outcome ids into Stake's own integer convention when a resolved library doesn't
// already carry one (see canonicalizeOutcomeIdsForStakeEngine, used by loadModes below), and shapes the
// result into a view.
export class StudioStakeEngineExportService {
    private readonly exporter: StakeEngineExporting<string>;
    private readonly validator: StakeEngineExportValidating<string>;
    private readonly bundleReader: OutcomeLibraryBundleReading<string>;
    private readonly stakeEngineImporter: StakeEngineImporting<string>;
    private readonly readFile: (resolvedPath: string) => string;
    private readonly realpath: (resolvedPath: string) => string;
    // Supplied by StudioServer through its materializing Project-runtime boundary. Keeping this as a
    // narrow hash resolver lets this service reject a stale canonical bundle without learning how a
    // Blueprint Project is materialized or how a game is loaded.
    private readonly resolveCurrentConfigHash: (projectRoot: string) => Promise<string | undefined>;
    private readonly planning: StudioArtifactConversionPlanning;

    constructor(
        pokieVersion: string,
        exporter: StakeEngineExporting<string> = new StakeEngineExporter<string>(pokieVersion),
        validator: StakeEngineExportValidating<string> = new StakeEngineExportValidator<string>(),
        readFile: (resolvedPath: string) => string = (resolvedPath) => fs.readFileSync(resolvedPath, "utf-8"),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
        bundleReader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        stakeEngineImporter: StakeEngineImporting<string> = new StakeEngineImporter<string>(),
        resolveCurrentConfigHash: (projectRoot: string) => Promise<string | undefined> = () => Promise.resolve(undefined),
        planning: StudioArtifactConversionPlanning = new StudioArtifactConversionPlanningService(pokieVersion),
    ) {
        this.exporter = exporter;
        this.validator = validator;
        this.readFile = readFile;
        this.realpath = realpath;
        this.bundleReader = bundleReader;
        this.stakeEngineImporter = stakeEngineImporter;
        this.resolveCurrentConfigHash = resolveCurrentConfigHash;
        this.planning = planning;
    }

    // The exact preflight StakeEngineExporter itself runs (and aborts the whole export on) before writing
    // a single file — exposed as its own step so the user can check a candidate mode set before committing
    // to Export, without triggering a write attempt. Also returns a per-mode provenance summary (outcome
    // count, libraryId/hash) read straight off each loaded library, never Stake-specific and never
    // recomputed beyond what computeWeightedOutcomeLibraryHash already does for every other tab.
    public async validate(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): Promise<StudioStakeEngineExportValidateView> {
        const plan = await this.prepareForSelectedBundles(projectRoot, modes, undefined);
        // A validation result is part of the same planner-governed lifecycle
        // as export.  Do not keep resolving selector-specific inputs after a
        // prepared plan has already established that this project cannot
        // produce the requested Stake artifact.
        if (plan.status === "conflict") {
            return {status: "conflict", error: plan.diagnostic?.message ?? "Stake Engine export has a destination conflict.", plan};
        }
        if (plan.status === "unavailable") {
            return {status: "unavailable", error: describeArtifactConversionPlanDiagnostic(plan) ?? plan.diagnostic?.message ?? "Stake Engine export is unavailable.", plan};
        }
        const selectedSource = this.selectedBundleSource(projectRoot, modes);
        const planDrift = selectedSource === undefined ? undefined : describePreparedArtifactPlanDrift(plan, selectedSource, "stakeAdapter");
        if (planDrift !== undefined) {
            return {status: "load-error", error: planDrift, plan};
        }
        const loaded = await this.loadModes(projectRoot, modes);
        if (loaded.status === "load-error") {
            return {...loaded, plan};
        }

        const issues = this.validator.validate(loaded.loaded);
        return {
            status: "ok",
            modes: loaded.loaded.map((mode) => ({
                modeName: mode.modeName,
                cost: mode.cost,
                outcomeCount: mode.library.outcomes.length,
                libraryId: mode.library.libraryId,
                libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
            })),
            errors: issues.filter((issue) => issue.severity === "error"),
            warnings: issues.filter((issue) => issue.severity !== "error"),
            plan,
        };
    }

    // Runs the real export once every mode's library has been loaded — StakeEngineExporter itself runs
    // full validation again here (never trusted from an earlier validate() call, which could be stale by
    // the time Export is actually clicked) and never writes anything on any validation error.
    //
    // ArtifactConversionPlan owns destination policy.  A planned Stake export
    // never replaces a populated destination, including a previous POKIE
    // export: callers must choose a fresh destination and prepare that plan.
    public async export(
        projectRoot: string,
        modes: readonly StudioStakeEngineExportModeInput[],
        outDir: string,
        _overwrite: boolean,
    ): Promise<StudioStakeEngineExportView> {
        const plan = await this.prepareForSelectedBundles(projectRoot, modes, path.resolve(projectRoot, outDir));
        // The exported plan owns destination safety as well as reachability.
        // In particular, an explicit Studio output path must not bypass the
        // registry's alias/source/occupied-destination checks through this
        // older exporter-specific overwrite flow.
        if (plan.status === "conflict") {
            return {
                status: "conflict",
                outDir: path.resolve(projectRoot, outDir),
                overwritable: false,
                error: plan.diagnostic?.message ?? "Stake Engine export has a destination conflict.",
                plan,
            };
        }
        if (plan.status === "unavailable") {
            return {status: "unavailable", error: describeArtifactConversionPlanDiagnostic(plan) ?? plan.diagnostic?.message ?? "Stake Engine export is unavailable.", plan};
        }
        const selectedSource = this.selectedBundleSource(projectRoot, modes);
        const planDrift = selectedSource === undefined ? undefined : describePreparedArtifactPlanDrift(plan, selectedSource, "stakeAdapter", path.resolve(projectRoot, outDir));
        if (planDrift !== undefined) {
            return {status: "load-error", error: planDrift, plan};
        }
        const resolvedOutDir = resolveProjectDirectory(projectRoot, outDir, this.realpath);
        if (resolvedOutDir.status === "error") {
            return {status: "load-error", error: resolvedOutDir.message, plan};
        }

        const loaded = await this.loadModes(projectRoot, modes);
        if (loaded.status === "load-error") {
            return {...loaded, plan};
        }

        let result;
        try {
            result = await this.exporter.exportToDirectory(loaded.loaded, resolvedOutDir.resolvedPath);
        } catch (error) {
            return {status: "load-error", error: `Could not export to "${outDir}": ${error instanceof Error ? error.message : String(error)}`, plan};
        }

        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (result.manifest === undefined || errors.length > 0) {
            return {status: "invalid", errors, warnings: result.issues.filter((issue) => issue.severity !== "error"), plan};
        }
        return {status: "ok", outDir: result.outDir, files: result.files, manifest: result.manifest, warnings: result.issues, plan};
    }

    // Rejects a bundle/Stake Engine selector whose own modeName names a different mode than its own
    // export row before resolving anything (see selectorModeName/describeSelectorModeMismatch) -- the
    // same guard StudioDeploymentService.run() applies to its own librarySelector-carrying modes.
    //
    // Every resolved library is then run through canonicalizeOutcomeIdsForStakeEngine -- the one place a
    // library produced by the canonical outcome-library generator (whose ids are content-addressed, never
    // plain integers) is made Stake-compatible, since neither the generator nor StakeEngineExporter itself
    // ever invents that mapping (see that function's own doc comment). A library that can't be
    // canonicalized (unreachable in practice -- see its own doc comment) is reported as this same
    // domain-level load-error, never a raw thrown error.
    private async loadModes(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): Promise<LoadModesResult> {
        const loaded: StakeEngineExportModeInput<string>[] = [];
        let currentConfigHash: string | undefined;
        let resolvedCurrentConfigHash = false;
        for (const mode of modes) {
            const namedSelectorMode = selectorModeName(mode.librarySelector);
            if (namedSelectorMode !== undefined && namedSelectorMode !== mode.modeName) {
                return {status: "load-error", error: describeSelectorModeMismatch(mode.modeName, namedSelectorMode)};
            }
            if (mode.librarySelector.kind === "bundle" && !resolvedCurrentConfigHash) {
                try {
                    currentConfigHash = await this.resolveCurrentConfigHash(projectRoot);
                    resolvedCurrentConfigHash = true;
                } catch (error) {
                    return {status: "load-error", error: `Could not resolve the current Project configuration: ${error instanceof Error ? error.message : String(error)}`};
                }
            }
            const compatibility = await this.validateBundleConfiguration(projectRoot, mode.librarySelector, currentConfigHash);
            if (compatibility !== undefined) {
                return {status: "load-error", error: `mode "${mode.modeName}": ${compatibility}`};
            }
            const result = await loadOutcomeLibraryFromSelector(projectRoot, mode.librarySelector, this.bundleReader, this.stakeEngineImporter, this.readFile, this.realpath);
            if (result.status === "load-error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${result.error}`};
            }
            const canonicalized = canonicalizeOutcomeIdsForStakeEngine(result.library);
            if (canonicalized.status === "error") {
                return {status: "load-error", error: `mode "${mode.modeName}": ${canonicalized.message}`};
            }
            loaded.push({modeName: mode.modeName, cost: mode.cost, library: canonicalized.library});
        }
        return {status: "ok", loaded};
    }

    /**
     * A canonical bundle selector is itself a recognized planner source.  Plan
     * from that selected directory, rather than from the open project, whenever
     * every requested mode names the same bundle.  Mixed/non-bundle selectors
     * retain their existing reader contract because they have no single durable
     * POKIE artifact identity for the planner to bind.
     */
    private prepareForSelectedBundles(
        projectRoot: string,
        modes: readonly StudioStakeEngineExportModeInput[],
        destinationPath: string | undefined,
    ): Promise<import("pokie").ArtifactConversionPlan> {
        const selectedSource = this.selectedBundleSource(projectRoot, modes);
        if (selectedSource !== undefined) {
            return destinationPath === undefined
                ? this.planning.prepare(selectedSource, "stakeAdapter")
                : this.planning.prepare(selectedSource, "stakeAdapter", destinationPath);
        }
        // External selectors must still yield an authoritative terminal planner
        // payload. A single JSON library retains its canonical location; a
        // mixed set is explicitly labelled as a mixed external selector set,
        // never as the open project.
        return Promise.resolve(createExternalOutcomeLibraryPlan(this.selectedExternalSource(projectRoot, modes), "stakeAdapter", destinationPath));
    }

    private selectedBundleSource(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): string | undefined {
        const bundleDirs = modes.map((mode) => mode.librarySelector).filter((selector): selector is Extract<OutcomeLibrarySelector, {kind: "bundle"}> => selector.kind === "bundle");
        const uniqueBundleDirs = Array.from(new Set(bundleDirs.map((selector) => path.resolve(projectRoot, selector.bundleDir))));
        return bundleDirs.length === modes.length && uniqueBundleDirs.length === 1 ? uniqueBundleDirs[0] : undefined;
    }

    private selectedExternalSource(projectRoot: string, modes: readonly StudioStakeEngineExportModeInput[]): string | undefined {
        const jsonPaths = modes.map((mode) => mode.librarySelector).filter((selector): selector is Extract<OutcomeLibrarySelector, {kind: "json"}> => selector.kind === "json");
        const uniquePaths = Array.from(new Set(jsonPaths.map((selector) => path.resolve(projectRoot, selector.path))));
        return jsonPaths.length === modes.length && uniquePaths.length === 1 ? uniquePaths[0] : undefined;
    }

    // A bundle is the only selector format that records its producing Project configuration. JSON
    // and imported Stake Engine sources have no equivalent provenance field, so they retain their
    // existing structural validation path; canonical Studio libraries must never silently cross a
    // Blueprint save boundary into a Stake export.
    private async validateBundleConfiguration(
        projectRoot: string,
        selector: OutcomeLibrarySelector,
        currentConfigHash: string | undefined,
    ): Promise<string | undefined> {
        if (selector.kind !== "bundle" || currentConfigHash === undefined) {
            return undefined;
        }
        const resolved = resolveProjectDirectory(projectRoot, selector.bundleDir, this.realpath);
        if (resolved.status === "error") {
            return resolved.message;
        }
        try {
            const manifest = await this.bundleReader.readManifest(resolved.resolvedPath);
            if (manifest.configHash === currentConfigHash) {
                return undefined;
            }
            return (
                `outcome library "${selector.bundleDir}" was built for configuration hash "${manifest.configHash ?? "unknown"}", ` +
                `but the current Project is "${currentConfigHash}". Regenerate the library before exporting to Stake.`
            );
        } catch (error) {
            return `Could not read outcome library "${selector.bundleDir}": ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}
