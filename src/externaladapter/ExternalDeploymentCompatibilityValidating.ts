import type {ValidationRule} from "../validation/ValidationRule.js";
import type {ExternalDeploymentCompatibilityContext} from "./ExternalDeploymentCompatibilityContext.js";

export interface ExternalDeploymentCompatibilityValidating<T extends string | number = string> extends ValidationRule<ExternalDeploymentCompatibilityContext<T>> {}
