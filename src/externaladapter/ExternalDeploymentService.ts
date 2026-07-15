import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalArtifactValidator} from "./ExternalArtifactValidator.js";
import {ExternalDeploymentCompatibilityValidator} from "./ExternalDeploymentCompatibilityValidator.js";
import type {ExternalDeploymentCompatibilityValidating} from "./ExternalDeploymentCompatibilityValidating.js";
import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";
import type {ExternalDeploymentResult} from "./ExternalDeploymentResult.js";
import type {ExternalDeploymentServicing} from "./ExternalDeploymentServicing.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";
import type {ExternalDeploymentTargetDescriptorValidating} from "./ExternalDeploymentTargetDescriptorValidating.js";
import {ExternalDeploymentTargetDescriptorValidator} from "./ExternalDeploymentTargetDescriptorValidator.js";
import {StandardExternalArtifactValidator} from "./StandardExternalArtifactValidator.js";

function hasError(issues: readonly ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === "error");
}

// The SDK's own single-call orchestrator: descriptor validation -> compatibility validation -> generation ->
// artifact validation -> optional diagnostic -> optional delivery, in that fixed order, with every stage past
// the first one that reports an error-severity issue simply never run (see ExternalDeploymentResult's own doc
// comment on why each stage's field is `undefined` rather than an empty placeholder in that case). This is the
// one place in the SDK that's allowed to assume "compatibility already passed" before calling a generator, or
// "artifacts already validated" before calling a runtime adapter — calling those collaborators directly, in a
// different order or skipping a stage, is exactly the class of mistake this orchestrator exists to make
// impossible for a normal caller to make by accident.
//
// Two invariants this class exists specifically to enforce, not just document:
//   - generation always receives `{roundProjector: target.roundProjector}` as its context — the target's own
//     declared projector, never a second one a generator might otherwise reach for on its own (see
//     ExternalArtifactGenerator's own doc comment).
//   - artifact validation always runs StandardExternalArtifactValidator, whether or not the target supplies its
//     own `artifactValidator` — a target's own validator can only ever add further issues on top (the same
//     "additive, never replacing" convention WeightedOutcomeLibraryValidator's own extraArtifactValidator uses),
//     so a permissive custom validator (one that always returns no issues) can never let an unsafe/duplicate/
//     malformed artifact set through.
export class ExternalDeploymentService<T extends string | number = string> implements ExternalDeploymentServicing<T> {
    private readonly descriptorValidator: ExternalDeploymentTargetDescriptorValidating<T>;
    private readonly compatibilityValidator: ExternalDeploymentCompatibilityValidating<T>;
    private readonly standardArtifactValidator: ExternalArtifactValidator;

    constructor(
        descriptorValidator: ExternalDeploymentTargetDescriptorValidating<T> = new ExternalDeploymentTargetDescriptorValidator<T>(),
        compatibilityValidator: ExternalDeploymentCompatibilityValidating<T> = new ExternalDeploymentCompatibilityValidator<T>(),
        standardArtifactValidator: ExternalArtifactValidator = new StandardExternalArtifactValidator(),
    ) {
        this.descriptorValidator = descriptorValidator;
        this.compatibilityValidator = compatibilityValidator;
        this.standardArtifactValidator = standardArtifactValidator;
    }

    public async deploy(target: ExternalDeploymentTarget<T>, modes: readonly ExternalDeploymentModeInput<T>[]): Promise<ExternalDeploymentResult> {
        const descriptorIssues = this.descriptorValidator.validate(target);
        if (hasError(descriptorIssues)) {
            return {descriptorIssues, compatibilityIssues: [], artifactIssues: []};
        }

        const compatibilityIssues = this.compatibilityValidator.validate({target, modes});
        if (hasError(compatibilityIssues)) {
            return {descriptorIssues, compatibilityIssues, artifactIssues: []};
        }

        const generation = target.artifactGenerator.generate(modes, {roundProjector: target.roundProjector});
        if (hasError(generation.issues)) {
            return {descriptorIssues, compatibilityIssues, generation, artifactIssues: []};
        }

        const artifactIssues = [...this.standardArtifactValidator.validate(generation), ...(target.artifactValidator?.validate(generation) ?? [])];
        if (hasError(artifactIssues)) {
            return {descriptorIssues, compatibilityIssues, generation, artifactIssues};
        }

        const diagnostic = target.diagnostic !== undefined ? await target.diagnostic.diagnose() : undefined;
        if (diagnostic !== undefined && !diagnostic.ok) {
            return {descriptorIssues, compatibilityIssues, generation, artifactIssues, diagnostic};
        }

        const delivery = target.runtimeAdapter !== undefined ? await target.runtimeAdapter.deliver(generation) : undefined;
        return {descriptorIssues, compatibilityIssues, generation, artifactIssues, diagnostic, delivery};
    }
}
