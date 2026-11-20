import type {ValidationRule} from "../validation/ValidationRule.js";
import type {ExternalExportCompatibilityContext} from "./ExternalExportCompatibilityContext.js";

export interface ExternalExportCompatibilityValidating<T extends string | number = string> extends ValidationRule<ExternalExportCompatibilityContext<T>> {}
