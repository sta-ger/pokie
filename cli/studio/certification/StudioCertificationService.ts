import {
    CertificationEvidenceBundleBuilder,
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
    public async validateSourceBundle(projectRoot: string, bundleDir: string): Promise<StudioCertificationSourceValidateView> {
        const resolved = resolveProjectDirectory(projectRoot, bundleDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        try {
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

    public async build(
        projectRoot: string,
        bundleDir: string,
        modes: readonly ValidatedCertificationBuildModeInput[],
        outDir: string,
    ): Promise<StudioCertificationBuildView> {
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
            const result = await this.builder.buildFromBundle(resolvedBundle.resolvedPath, modeInputs, resolvedOutDir.resolvedPath);
            const errors = result.issues.filter((issue) => issue.severity === "error");
            const warnings = result.issues.filter((issue) => issue.severity !== "error");
            if (result.manifest === undefined || errors.length > 0) {
                return {status: "error", errors, warnings};
            }
            return {status: "ok", manifest: result.manifest, files: result.files, warnings};
        } catch (error) {
            return {
                status: "load-error",
                error: `Could not build a certification/evidence bundle from "${bundleDir}": ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
