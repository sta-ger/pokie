import type {ValidationRule} from "../validation/ValidationRule.js";
import type {ExternalExportTarget} from "./ExternalExportTarget.js";

export interface ExternalExportTargetDescriptorValidating<T extends string | number = string> extends ValidationRule<ExternalExportTarget<T>> {}
