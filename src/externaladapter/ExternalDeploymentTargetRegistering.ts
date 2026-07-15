import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";

export interface ExternalDeploymentTargetRegistering<T extends string | number = string> {
    register(target: ExternalDeploymentTarget<T>): void;
    has(id: string): boolean;
    get(id: string): ExternalDeploymentTarget<T> | undefined;
    list(): readonly ExternalDeploymentTarget<T>[];
}
