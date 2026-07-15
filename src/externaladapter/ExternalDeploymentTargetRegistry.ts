import {ExternalDeploymentDuplicateTargetError} from "./ExternalDeploymentDuplicateTargetError.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";
import type {ExternalDeploymentTargetRegistering} from "./ExternalDeploymentTargetRegistering.js";

// A stateful catalog of ExternalDeploymentTarget instances, keyed by their own "id". Refuses to register a
// target whose id is already taken — exactly, or only differing by case (the same reasoning
// StakeEngineExportValidator's mode-name check and StandardExternalArtifactValidator's path check both use: two
// ids differing only in case would be indistinguishable to a case-insensitive consumer — a config file, a CLI
// flag, a case-insensitive lookup elsewhere in a caller's own stack — so allowing both to register at all
// invites exactly the kind of "which one actually ran" ambiguity a registry exists to prevent). Registration
// order does not matter: whichever target calls register() second is the one rejected, regardless of whether
// its id exactly repeats the first or merely collides in case.
//
// Not itself a singleton — a caller owns and constructs its own registry instance(s); nothing in this SDK
// reaches for a shared global registry.
export class ExternalDeploymentTargetRegistry<T extends string | number = string> implements ExternalDeploymentTargetRegistering<T> {
    private readonly targetsByLowerId = new Map<string, ExternalDeploymentTarget<T>>();

    public register(target: ExternalDeploymentTarget<T>): void {
        if (typeof target.id !== "string" || target.id.trim().length === 0) {
            throw new ExternalDeploymentDuplicateTargetError(`ExternalDeploymentTarget has an invalid id (${JSON.stringify(target.id)}); it must be a non-empty string.`);
        }

        const lowerId = target.id.toLowerCase();
        const existing = this.targetsByLowerId.get(lowerId);
        if (existing === undefined) {
            this.targetsByLowerId.set(lowerId, target);
            return;
        }

        if (existing.id === target.id) {
            throw new ExternalDeploymentDuplicateTargetError(`An ExternalDeploymentTarget with id "${target.id}" is already registered.`);
        }
        throw new ExternalDeploymentDuplicateTargetError(
            `ExternalDeploymentTarget id "${target.id}" differs only in case from already-registered id "${existing.id}"; these would be indistinguishable to a case-insensitive lookup, so registration is refused rather than let one silently shadow the other.`,
        );
    }

    public has(id: string): boolean {
        return this.targetsByLowerId.has(id.toLowerCase());
    }

    public get(id: string): ExternalDeploymentTarget<T> | undefined {
        return this.targetsByLowerId.get(id.toLowerCase());
    }

    public list(): readonly ExternalDeploymentTarget<T>[] {
        return [...this.targetsByLowerId.values()];
    }
}
