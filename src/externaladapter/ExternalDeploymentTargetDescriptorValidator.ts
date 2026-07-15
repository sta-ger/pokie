import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";
import type {ExternalDeploymentTargetDescriptorValidating} from "./ExternalDeploymentTargetDescriptorValidating.js";
import {isValidSemverLite} from "./internal/compareSemverLite.js";

// An ExternalDeploymentTarget's own static type guarantees nothing about a value that actually arrives at
// runtime — e.g. a target assembled by hand, deserialized, or mutated after construction. Every field is read
// through this loosened view so the checks below are real runtime guards, the same idiom
// RoundArtifactValidator/WeightedOutcomeLibraryValidator use for the same reason.
type Loose<X> = {[K in keyof X]?: unknown};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

// Checks an ExternalDeploymentTarget's own descriptor is well-formed, independent of any specific content being
// deployed to it (contrast with ExternalDeploymentCompatibilityValidator, which checks a target against
// specific deployment content): non-empty id/version, well-shaped requirements, a unique (no exact-duplicate or
// case-colliding) capabilities list, and every required/optional collaborator implementing the method its own
// contract requires. Run by both ExternalDeploymentTargetRegistry.register() (throws
// ExternalDeploymentInvalidTargetError on any error-severity issue) and ExternalDeploymentService.deploy() (the
// same "validate before doing anything else" gate, surfaced as `descriptorIssues` instead of thrown) — one
// single source of truth for "is this even a usable target", never checked one way in one place and a different
// way in the other. Never throws.
export class ExternalDeploymentTargetDescriptorValidator<T extends string | number = string> implements ExternalDeploymentTargetDescriptorValidating<T> {
    public validate(target: ExternalDeploymentTarget<T>): ValidationIssue[] {
        try {
            return this.validateInternal(target as Loose<ExternalDeploymentTarget<T>>);
        } catch (error) {
            return [
                {
                    code: "external-deployment-target-malformed",
                    severity: "error",
                    message: `ExternalDeploymentTarget could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(target: Loose<ExternalDeploymentTarget<T>>): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const id = isNonEmptyString(target.id) ? target.id : "<unknown>";

        if (!isNonEmptyString(target.id)) {
            issues.push({
                code: "external-deployment-target-id-invalid",
                severity: "error",
                message: `Target id must be a non-empty string, got ${JSON.stringify(target.id)}.`,
            });
        }
        if (!isNonEmptyString(target.version)) {
            issues.push({
                code: "external-deployment-target-version-invalid",
                severity: "error",
                message: `Target "${id}" version must be a non-empty string, got ${JSON.stringify(target.version)}.`,
            });
        }

        this.validateRequirements(id, target.requirements as Loose<Record<string, unknown>>, issues);
        this.validateCapabilities(id, target.capabilities, issues);

        if (!isFunction((target.roundProjector as Loose<{project: unknown}> | undefined)?.project)) {
            issues.push({
                code: "external-deployment-target-round-projector-invalid",
                severity: "error",
                message: `Target "${id}" roundProjector must implement a "project" method.`,
            });
        }
        if (!isFunction((target.artifactGenerator as Loose<{generate: unknown}> | undefined)?.generate)) {
            issues.push({
                code: "external-deployment-target-artifact-generator-invalid",
                severity: "error",
                message: `Target "${id}" artifactGenerator must implement a "generate" method.`,
            });
        }
        if (target.artifactValidator !== undefined && !isFunction((target.artifactValidator as Loose<{validate: unknown}>).validate)) {
            issues.push({
                code: "external-deployment-target-artifact-validator-invalid",
                severity: "error",
                message: `Target "${id}" artifactValidator, when present, must implement a "validate" method.`,
            });
        }
        if (target.diagnostic !== undefined && !isFunction((target.diagnostic as Loose<{diagnose: unknown}>).diagnose)) {
            issues.push({
                code: "external-deployment-target-diagnostic-invalid",
                severity: "error",
                message: `Target "${id}" diagnostic, when present, must implement a "diagnose" method.`,
            });
        }
        if (target.runtimeAdapter !== undefined && !isFunction((target.runtimeAdapter as Loose<{deliver: unknown}>).deliver)) {
            issues.push({
                code: "external-deployment-target-runtime-adapter-invalid",
                severity: "error",
                message: `Target "${id}" runtimeAdapter, when present, must implement a "deliver" method.`,
            });
        }

        return issues;
    }

    private validateRequirements(id: string, requirements: Loose<Record<string, unknown>> | undefined, issues: ValidationIssue[]): void {
        if (typeof requirements !== "object" || requirements === null) {
            issues.push({
                code: "external-deployment-target-requirements-invalid",
                severity: "error",
                message: `Target "${id}" requirements must be an object.`,
            });
            return;
        }

        if (
            requirements.minPokieVersion !== undefined &&
            (typeof requirements.minPokieVersion !== "string" || !isValidSemverLite(requirements.minPokieVersion))
        ) {
            issues.push({
                code: "external-deployment-target-min-pokie-version-invalid",
                severity: "error",
                message: `Target "${id}" requirements.minPokieVersion (${JSON.stringify(requirements.minPokieVersion)}) must be a "major.minor.patch" version string.`,
            });
        }
        if (requirements.symbolAlphabet !== undefined && requirements.symbolAlphabet !== "numeric" && requirements.symbolAlphabet !== "any") {
            issues.push({
                code: "external-deployment-target-symbol-alphabet-invalid",
                severity: "error",
                message: `Target "${id}" requirements.symbolAlphabet (${JSON.stringify(requirements.symbolAlphabet)}) must be "numeric" or "any" when present.`,
            });
        }
        if (requirements.requiresHomogeneousProvenance !== undefined && typeof requirements.requiresHomogeneousProvenance !== "boolean") {
            issues.push({
                code: "external-deployment-target-requires-homogeneous-provenance-invalid",
                severity: "error",
                message: `Target "${id}" requirements.requiresHomogeneousProvenance must be a boolean when present.`,
            });
        }
    }

    private validateCapabilities(id: string, capabilities: unknown, issues: ValidationIssue[]): void {
        if (!Array.isArray(capabilities)) {
            issues.push({
                code: "external-deployment-target-capabilities-invalid",
                severity: "error",
                message: `Target "${id}" capabilities must be an array of non-empty strings.`,
            });
            return;
        }

        const seen = new Map<string, string>(); // lowercase capability -> original capability
        capabilities.forEach((capability: unknown, position: number) => {
            if (!isNonEmptyString(capability)) {
                issues.push({
                    code: "external-deployment-target-capabilities-invalid",
                    severity: "error",
                    message: `Target "${id}" capabilities[${position}] (${JSON.stringify(capability)}) must be a non-empty string.`,
                });
                return;
            }

            const lower = capability.toLowerCase();
            const existing = seen.get(lower);
            if (existing === undefined) {
                seen.set(lower, capability);
            } else if (existing === capability) {
                issues.push({
                    code: "external-deployment-target-duplicate-capability",
                    severity: "error",
                    message: `Target "${id}" declares capability "${capability}" more than once.`,
                });
            } else {
                issues.push({
                    code: "external-deployment-target-capability-case-collision",
                    severity: "error",
                    message: `Target "${id}" declares capabilities "${capability}" and "${existing}", which differ only in case.`,
                });
            }
        });
    }
}
