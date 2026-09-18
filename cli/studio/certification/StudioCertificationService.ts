import {
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleBuildCancelledError,
    CertificationEvidenceBundleBuilding,
    CertificationEvidenceBundleModeSampleInput,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
} from "pokie";
import fs from "fs";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioCertificationBuildView} from "./StudioCertificationBuildView.js";
import type {StudioCertificationSourceValidateView} from "./StudioCertificationSourceValidateView.js";
import type {ValidatedCertificationBuildModeInput} from "./validateCertificationBuildRequest.js";

export type StudioCertificationProgressReporting = (
    stage: string,
    unit: string,
    current: number | "indeterminate",
    total: number | "indeterminate",
    message: string,
) => void;

export type StudioCertificationExecutionOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: StudioCertificationProgressReporting;
};

function executionOptions(options: AbortSignal | StudioCertificationExecutionOptions | undefined): StudioCertificationExecutionOptions {
    return options instanceof AbortSignal ? {signal: options} : options ?? {};
}

// The Certification tab, built directly on top of pokie's own CertificationEvidenceBundleBuilder /
// OutcomeLibraryBundleValidator (see docs/certification-evidence-bundle.md) -- this class never samples
// a round, computes a hash, or re-implements the builder's own "no partial bundle"/self-validation
// contracts; it only resolves a request's paths against the active project's root (the same
// resolveProjectDirectory containment check every other project-scoped Studio service already uses) and
// shapes the result into a view.
export class StudioCertificationService {
    private readonly bundleValidator: OutcomeLibraryBundleValidating;
    private readonly builder: CertificationEvidenceBundleBuilding;
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        pokieVersion: string,
        builder: CertificationEvidenceBundleBuilding = new CertificationEvidenceBundleBuilder(pokieVersion),
        bundleValidator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.builder = builder;
        this.bundleValidator = bundleValidator;
        this.realpath = realpath;
    }

    // The exact preflight CertificationEvidenceBundleBuilder itself runs (and aborts the whole build on)
    // before ever sampling a round -- exposed as its own step so the user can check a candidate source
    // bundle before committing to Build, without triggering a build attempt.
    public async validateSourceBundle(projectRoot: string, bundleDir: string, options?: AbortSignal | StudioCertificationExecutionOptions): Promise<StudioCertificationSourceValidateView> {
        const {signal, onProgress} = executionOptions(options);
        onProgress?.("Resolving evidence", "validation stages", 0, 2, "Resolving the requested certification bundle.");
        if (signal?.aborted) {
            return {status: "load-error", error: "Certification source validation was cancelled before it started."};
        }
        const resolved = resolveProjectDirectory(projectRoot, bundleDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        try {
            onProgress?.("Deep validation", "validation stages", 1, 2, "Checking evidence files and immutable provenance.");
            const issues = await this.bundleValidator.validate(resolved.resolvedPath, {deep: true});
            if (signal?.aborted) {
                return {status: "load-error", error: "Certification source validation was cancelled after its last settled validation boundary."};
            }
            onProgress?.("Collecting diagnostics", "validation stages", 2, 2, "Recording certification validation diagnostics.");
            return {
                status: "ok",
                errors: issues.filter((issue) => issue.severity === "error"),
                warnings: issues.filter((issue) => issue.severity !== "error"),
            };
        } catch (error) {
            return {status: "load-error", error: `Could not deep-validate bundle "${bundleDir}": ${error instanceof Error ? error.message : String(error)}`};
        }
    }

    public async build(
        projectRoot: string,
        bundleDir: string,
        modes: readonly ValidatedCertificationBuildModeInput[],
        outDir: string,
        options?: AbortSignal | StudioCertificationExecutionOptions,
    ): Promise<StudioCertificationBuildView> {
        const {signal, onProgress} = executionOptions(options);
        const sampleCount = modes.reduce((total, mode) => total + mode.sampleCount, 0);
        onProgress?.("Resolving inputs", "build stages", 0, 3, "Resolving the evidence source and staging destination.");
        const resolvedBundle = resolveProjectDirectory(projectRoot, bundleDir, this.realpath);
        if (resolvedBundle.status === "error") {
            return {status: "load-error", error: resolvedBundle.message};
        }
        const resolvedOutDir = resolveProjectDirectory(projectRoot, outDir, this.realpath);
        if (resolvedOutDir.status === "error") {
            return {status: "load-error", error: resolvedOutDir.message};
        }

        const modeInputs: CertificationEvidenceBundleModeSampleInput[] = modes.map((mode) => ({
            modeName: mode.modeName,
            seed: mode.seed,
            sampleCount: mode.sampleCount,
        }));

        try {
            onProgress?.("Sampling evidence", "samples", 0, sampleCount, `Building evidence for ${modes.length} mode${modes.length === 1 ? "" : "s"}.`);
            const result = await this.builder.buildFromBundle(resolvedBundle.resolvedPath, modeInputs, resolvedOutDir.resolvedPath, {
                signal,
                onSample: (completed, total) => onProgress?.("Sampling evidence", "samples", completed, total, `Verified ${completed} of ${total} certification samples.`),
            });
            onProgress?.("Validating publication", "build stages", 3, 3, "Checking the atomically published certification manifest.");
            const errors = result.issues.filter((issue) => issue.severity === "error");
            const warnings = result.issues.filter((issue) => issue.severity !== "error");
            if (result.manifest === undefined || errors.length > 0) {
                return {status: "error", errors, warnings};
            }
            return {status: "ok", manifest: result.manifest, files: result.files, warnings};
        } catch (error) {
            if (error instanceof CertificationEvidenceBundleBuildCancelledError) {
                return {
                    status: "load-error",
                    error: "Certification/evidence build was cancelled. No incomplete evidence was published; retry the build when ready.",
                };
            }
            return {
                status: "load-error",
                error: `Could not build a certification/evidence bundle from "${bundleDir}": ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
