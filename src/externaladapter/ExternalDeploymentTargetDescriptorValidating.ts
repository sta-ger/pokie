import type {ValidationRule} from "../validation/ValidationRule.js";
import type {ExternalDeploymentTarget} from "./ExternalDeploymentTarget.js";

export interface ExternalDeploymentTargetDescriptorValidating<T extends string | number = string> extends ValidationRule<ExternalDeploymentTarget<T>> {}
