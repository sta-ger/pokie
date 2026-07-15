import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineImportBundle} from "./StakeEngineImportBundle.js";

export interface StakeEngineImportValidating {
    validate(bundle: StakeEngineImportBundle): ValidationIssue[];
}
