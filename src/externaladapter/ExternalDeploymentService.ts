import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalArtifactValidator} from "./ExternalArtifactValidator.js";
import {ExternalDeploymentCompatibilityValidator} from "./ExternalDeploymentCompatibilityValidator.js";
import type {ExternalDeploymentCompatibilityValidating} from "./ExternalDeploymentCompatibilityValidating.js";
import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";
import type {ExternalDeploymentProjectedModeInput} from "./ExternalDeploymentProjectedModeInput.js";
import type {ExternalDeploymentProjectedOutcome} from "./ExternalDeploymentProjectedOutcome.js";
import type {ExternalDeploymentResult} from "./ExternalDeploymentResult.js";
import type {ExternalDeploymentServicing} from "./ExternalDeploymentServicing.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";
import type {ExternalDeploymentTargetDescriptorValidating} from "./ExternalDeploymentTargetDescriptorValidating.js";
import {ExternalDeploymentTargetDescriptorValidator} from "./ExternalDeploymentTargetDescriptorValidator.js";
import {StandardExternalArtifactValidator} from "./StandardExternalArtifactValidator.js";

function hasError(issues: readonly ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === "error");
}

// The SDK's own single-call orchestrator: descriptor validation -> compatibility validation -> projection ->
// generation -> artifact validation -> optional diagnostic -> optional delivery, in that fixed order, with
// every stage past the first one that reports an error-severity issue simply never run (see
// ExternalDeploymentResult's own doc comment on why each stage's field is `undefined` rather than an empty
// placeholder in that case). This is the one place in the SDK that's allowed to assume "compatibility already
// passed" before projecting, or "artifacts already validated" before calling a runtime adapter — calling those
// collaborators directly, in a different order or skipping a stage, is exactly the class of mistake this
// orchestrator exists to make impossible for a normal caller to make by accident.
//
// Four invariants this class exists specifically to enforce, not just document:
//   - **The three mandatory built-in validators (descriptor/compatibility/artifact) always run, in full, no
//     matter what.** They are not constructor parameters and cannot be swapped out or disabled — the
//     constructor only accepts an *extra* validator per stage, whose own issues are always concatenated onto
//     (never substituted for) the built-in ones. A permissive extra validator — one that always returns no
//     issues — can therefore never make a genuinely broken target/deployment/artifact set look clean to a
//     caller who only inspects the final `ExternalDeploymentResult`.
//   - **Projection happens exactly once, here, and nowhere else.** `deploy()` itself calls
//     `target.roundProjector.project(...)` for every outcome in every mode — never the generator (see
//     ExternalArtifactGenerator's own doc comment) — and hands the generator only the resulting
//     ExternalDeploymentProjectedModeInput[]. A generator has no RoundArtifact, no ExternalRoundProjector
//     reference, and nothing generic-over-T to project through, so it has no way to select, ignore, or diverge
//     from the target's own declared projector.
//   - **A thrown exception from descriptor validation, compatibility validation, projection, generation, or
//     artifact validation is always caught and turned into a single error-severity ValidationIssue** — on the
//     relevant stage's own issues, exactly as if that collaborator had reported the problem the normal way —
//     rather than being allowed to propagate out of `deploy()` itself. Every stage after the one that threw is
//     still simply never run, the same as for a normally-reported error.
//   - **`target.diagnostic`/`target.runtimeAdapter` are never called once an earlier stage has failed.**
//   - **A generator's return value is treated as an untrusted `unknown` runtime value, not the
//     ExternalArtifactGenerationResult its own TypeScript type declares.** StandardExternalArtifactValidator
//     always runs against it first, before anything here ever reads `.issues`/`.artifacts` off it. If that
//     structural check fails, the malformed value is never exposed as `generation` on the returned
//     ExternalDeploymentResult (which stays `undefined`, the same as if generation had never been attempted),
//     and target.artifactValidator/the extra artifact validator/target.diagnostic/target.runtimeAdapter are all
//     skipped, exactly like any other stage failure.
export class ExternalDeploymentService<T extends string | number = string> implements ExternalDeploymentServicing<T> {
    private readonly descriptorValidator: ExternalDeploymentTargetDescriptorValidating<T> = new ExternalDeploymentTargetDescriptorValidator<T>();
    private readonly compatibilityValidator: ExternalDeploymentCompatibilityValidating<T> = new ExternalDeploymentCompatibilityValidator<T>();
    private readonly standardArtifactValidator: ExternalArtifactValidator = new StandardExternalArtifactValidator();
    private readonly extraDescriptorValidator: ExternalDeploymentTargetDescriptorValidating<T> | undefined;
    private readonly extraCompatibilityValidator: ExternalDeploymentCompatibilityValidating<T> | undefined;
    private readonly extraArtifactValidator: ExternalArtifactValidator | undefined;

    // Every parameter here is *additive only* — see the class's own doc comment. There is deliberately no way
    // to pass a replacement for the built-in descriptor/compatibility/artifact validators; only a further check
    // layered on top of them.
    constructor(
        extraDescriptorValidator?: ExternalDeploymentTargetDescriptorValidating<T>,
        extraCompatibilityValidator?: ExternalDeploymentCompatibilityValidating<T>,
        extraArtifactValidator?: ExternalArtifactValidator,
    ) {
        this.extraDescriptorValidator = extraDescriptorValidator;
        this.extraCompatibilityValidator = extraCompatibilityValidator;
        this.extraArtifactValidator = extraArtifactValidator;
    }

    public async deploy(target: ExternalDeploymentTarget<T>, modes: readonly ExternalDeploymentModeInput<T>[]): Promise<ExternalDeploymentResult> {
        const descriptorIssues = [
            ...this.safeIssues(() => this.descriptorValidator.validate(target), "external-deployment-descriptor-validator-threw", "Descriptor validation"),
            ...this.safeIssues(
                () => this.extraDescriptorValidator?.validate(target) ?? [],
                "external-deployment-extra-descriptor-validator-threw",
                "Extra descriptor validation",
            ),
        ];
        if (hasError(descriptorIssues)) {
            return {descriptorIssues, compatibilityIssues: [], projectionIssues: [], artifactIssues: []};
        }

        const compatibilityIssues = [
            ...this.safeIssues(
                () => this.compatibilityValidator.validate({target, modes}),
                "external-deployment-compatibility-validator-threw",
                "Compatibility validation",
            ),
            ...this.safeIssues(
                () => this.extraCompatibilityValidator?.validate({target, modes}) ?? [],
                "external-deployment-extra-compatibility-validator-threw",
                "Extra compatibility validation",
            ),
        ];
        if (hasError(compatibilityIssues)) {
            return {descriptorIssues, compatibilityIssues, projectionIssues: [], artifactIssues: []};
        }

        const {projected, issues: projectionIssues} = this.projectModes(target, modes);
        if (projected === undefined) {
            return {descriptorIssues, compatibilityIssues, projectionIssues, artifactIssues: []};
        }

        // "rawGeneration" is deliberately typed `unknown`, never ExternalArtifactGenerationResult — a
        // caller-supplied ExternalArtifactGenerator is a runtime value POKIE has no way to actually enforce the
        // shape of, whatever its own TypeScript type declares. It stays unknown until
        // StandardExternalArtifactValidator has confirmed it below; nothing here reads `.issues`/`.artifacts`
        // off it before that.
        let rawGeneration: unknown;
        try {
            rawGeneration = target.artifactGenerator.generate(projected);
        } catch (error) {
            rawGeneration = {
                artifacts: [],
                issues: [
                    {
                        code: "external-deployment-generator-threw",
                        severity: "error",
                        message: `artifactGenerator.generate threw: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }

        // Structural validation always runs first, against the still-untrusted raw value — see
        // StandardExternalArtifactValidator's own doc comment for what "structural" covers (an object at all,
        // "artifacts"/"issues" as arrays, every artifact's own relativePath/content well-typed, ...). A
        // malformed result is reported here and *never* exposed as "generation" on the returned
        // ExternalDeploymentResult — not even as a partially-trusted value — and neither target.artifactValidator,
        // the extra artifact validator, target.diagnostic, nor target.runtimeAdapter is ever called against it.
        const shapeIssues = this.safeIssues(
            () => this.standardArtifactValidator.validate(rawGeneration as ExternalArtifactGenerationResult),
            "external-deployment-standard-artifact-validator-threw",
            "Standard artifact validation",
        );
        if (hasError(shapeIssues)) {
            return {descriptorIssues, compatibilityIssues, projectionIssues, artifactIssues: shapeIssues};
        }

        // Safe from here on: StandardExternalArtifactValidator has already confirmed "artifacts"/"issues" are
        // arrays and every artifact's own relativePath/content are well-typed, so this cast reflects a
        // structural guarantee that's actually been checked, not merely assumed.
        const generation = rawGeneration as ExternalArtifactGenerationResult;
        if (hasError(generation.issues)) {
            return {descriptorIssues, compatibilityIssues, projectionIssues, generation, artifactIssues: shapeIssues};
        }

        const artifactIssues = [
            ...shapeIssues,
            ...this.safeIssues(
                () => target.artifactValidator?.validate(generation) ?? [],
                "external-deployment-target-artifact-validator-threw",
                "Target artifact validation",
            ),
            ...this.safeIssues(
                () => this.extraArtifactValidator?.validate(generation) ?? [],
                "external-deployment-extra-artifact-validator-threw",
                "Extra artifact validation",
            ),
        ];
        if (hasError(artifactIssues)) {
            return {descriptorIssues, compatibilityIssues, projectionIssues, generation, artifactIssues};
        }

        const diagnostic = target.diagnostic !== undefined ? await target.diagnostic.diagnose() : undefined;
        if (diagnostic !== undefined && !diagnostic.ok) {
            return {descriptorIssues, compatibilityIssues, projectionIssues, generation, artifactIssues, diagnostic};
        }

        const delivery = target.runtimeAdapter !== undefined ? await target.runtimeAdapter.deliver(generation) : undefined;
        return {descriptorIssues, compatibilityIssues, projectionIssues, generation, artifactIssues, diagnostic, delivery};
    }

    // Runs one validator call, catching any thrown exception and turning it into a single error-severity
    // ValidationIssue instead of letting it propagate out of deploy() — the one place this "exception ->
    // diagnostic" conversion actually happens, shared by every validator call site above (built-in and extra
    // alike, since even a built-in is only ever *documented* to never throw, not structurally prevented from
    // it).
    private safeIssues(run: () => readonly ValidationIssue[], code: string, description: string): readonly ValidationIssue[] {
        try {
            return run();
        } catch (error) {
            return [{code, severity: "error", message: `${description} threw: ${error instanceof Error ? error.message : String(error)}`}];
        }
    }

    // Runs every outcome in every mode through `target.roundProjector` — the projection stage described in the
    // class's own doc comment. A per-outcome projector failure or non-JSON-safe projected output is reported
    // against that specific outcome and the rest of the batch keeps going (so a caller sees every problem in one
    // pass, not just the first) — but `projected` itself is only returned once no error-severity issue was
    // reported, exactly like every other stage's "all-or-nothing" contract.
    private projectModes(
        target: ExternalDeploymentTarget<T>,
        modes: readonly ExternalDeploymentModeInput<T>[],
    ): {projected?: readonly ExternalDeploymentProjectedModeInput[]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const projectedModes: ExternalDeploymentProjectedModeInput[] = [];

        modes.forEach((mode) => {
            const outcomes: ExternalDeploymentProjectedOutcome[] = [];

            mode.library.outcomes.forEach((outcome) => {
                let projected;
                try {
                    projected = target.roundProjector.project(outcome.artifact);
                } catch (error) {
                    issues.push({
                        code: "external-deployment-projection-failed",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": round projector failed: ${error instanceof Error ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, outcomeId: outcome.id},
                    });
                    return;
                }

                try {
                    toCanonicalJson(projected);
                } catch (error) {
                    issues.push({
                        code: "external-deployment-projection-not-json-safe",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": projected output is not JSON-safe: ${error instanceof InvalidJsonValueError ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, outcomeId: outcome.id},
                    });
                    return;
                }

                outcomes.push({id: outcome.id, weight: outcome.weight, projected});
            });

            let libraryHash: string;
            try {
                libraryHash = computeWeightedOutcomeLibraryHash(mode.library);
            } catch (error) {
                issues.push({
                    code: "external-deployment-library-hash-failed",
                    severity: "error",
                    message: `mode "${mode.modeName}": failed to compute the library hash: ${error instanceof Error ? error.message : String(error)}`,
                    details: {modeName: mode.modeName},
                });
                return;
            }

            projectedModes.push({modeName: mode.modeName, libraryId: mode.library.libraryId, libraryHash, outcomes});
        });

        if (hasError(issues)) {
            return {projected: undefined, issues};
        }
        return {projected: projectedModes, issues};
    }
}
