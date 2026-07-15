import type {ExternalDeploymentModeInput} from "./ExternalDeploymentModeInput.js";
import type {ExternalDeploymentResult} from "./ExternalDeploymentResult.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";

export interface ExternalDeploymentServicing<T extends string | number = string> {
    deploy(target: ExternalDeploymentTarget<T>, modes: readonly ExternalDeploymentModeInput<T>[]): Promise<ExternalDeploymentResult>;
}
