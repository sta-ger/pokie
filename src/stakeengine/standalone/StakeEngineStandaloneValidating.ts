import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {StakeEngineStandaloneBundle} from "./StakeEngineStandaloneBundle.js";

export interface StakeEngineStandaloneValidating {
    validate(bundle: StakeEngineStandaloneBundle): ValidationIssue[];
}
