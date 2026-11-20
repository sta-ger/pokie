import {ExternalExportDuplicateTargetError} from "./ExternalExportDuplicateTargetError.js";
import {ExternalExportInvalidTargetError} from "./ExternalExportInvalidTargetError.js";
import type {ExternalExportTarget} from "./ExternalExportTarget.js";
import type {ExternalExportTargetDescriptorValidating} from "./ExternalExportTargetDescriptorValidating.js";
import {ExternalExportTargetDescriptorValidator} from "./ExternalExportTargetDescriptorValidator.js";
import type {ExternalExportTargetRegistering} from "./ExternalExportTargetRegistering.js";

// A stateful catalog of ExternalExportTarget instances, keyed by their own "id". register() first runs
// ExternalExportTargetDescriptorValidator (throwing ExternalExportInvalidTargetError on any
// error-severity issue — an empty id/version, malformed requirements, non-unique capabilities, or a collaborator
// missing its required method), then refuses to register a target whose id is already taken — exactly, or only
// differing by case (the same reasoning StakeEngineExportValidator's mode-name check and
// StandardExternalFileValidator's path check both use: two ids differing only in case would be
// indistinguishable to a case-insensitive consumer — a config file, a CLI flag, a case-insensitive lookup
// elsewhere in a caller's own stack — so allowing both to register at all invites exactly the kind of "which one
// actually ran" ambiguity a registry exists to prevent). Registration order does not matter: whichever target
// calls register() second is the one rejected, regardless of whether its id exactly repeats the first or merely
// collides in case.
//
// A successfully registered target is frozen (its own top-level properties, plus its "capabilities" array and
// "requirements" object) — never its nested collaborator instances (roundProjector/artifactGenerator/... keep
// whatever mutable internal state they need). This is deliberate: without it, `target.id = "somethingElse"`
// after registration would silently desync the object a caller holds from the key it's actually stored under,
// and get(originalId) would keep resolving a target whose own `.id` field no longer agrees with how it was
// looked up. Freezing makes that reassignment throw instead (ES modules are always strict mode), so a
// registered target's identity can never drift out from under the registry that vouched for it.
//
// Not itself a singleton — a caller owns and constructs its own registry instance(s); nothing in this SDK
// reaches for a shared global registry.
export class ExternalExportTargetRegistry<T extends string | number = string> implements ExternalExportTargetRegistering<T> {
    private readonly targetsByLowerId = new Map<string, ExternalExportTarget<T>>();
    private readonly descriptorValidator: ExternalExportTargetDescriptorValidating<T>;

    constructor(descriptorValidator: ExternalExportTargetDescriptorValidating<T> = new ExternalExportTargetDescriptorValidator<T>()) {
        this.descriptorValidator = descriptorValidator;
    }

    public register(target: ExternalExportTarget<T>): void {
        const descriptorErrors = this.descriptorValidator.validate(target).filter((issue) => issue.severity === "error");
        if (descriptorErrors.length > 0) {
            throw new ExternalExportInvalidTargetError(
                `ExternalExportTarget failed descriptor validation: ${descriptorErrors.map((issue) => issue.message).join(" ")}`,
            );
        }

        const lowerId = target.id.toLowerCase();
        const existing = this.targetsByLowerId.get(lowerId);
        if (existing === undefined) {
            Object.freeze(target.capabilities);
            Object.freeze(target.requirements);
            Object.freeze(target);
            this.targetsByLowerId.set(lowerId, target);
            return;
        }

        if (existing.id === target.id) {
            throw new ExternalExportDuplicateTargetError(`An ExternalExportTarget with id "${target.id}" is already registered.`);
        }
        throw new ExternalExportDuplicateTargetError(
            `ExternalExportTarget id "${target.id}" differs only in case from already-registered id "${existing.id}"; these would be indistinguishable to a case-insensitive lookup, so registration is refused rather than let one silently shadow the other.`,
        );
    }

    public has(id: string): boolean {
        return this.targetsByLowerId.has(id.toLowerCase());
    }

    public get(id: string): ExternalExportTarget<T> | undefined {
        return this.targetsByLowerId.get(id.toLowerCase());
    }

    public list(): readonly ExternalExportTarget<T>[] {
        return [...this.targetsByLowerId.values()];
    }
}
