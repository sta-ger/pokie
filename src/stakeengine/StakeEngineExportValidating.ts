import type {ValidationRule} from "../validation/ValidationRule.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";

export interface StakeEngineExportValidating<T extends string | number = string>
    extends ValidationRule<readonly StakeEngineExportModeInput<T>[]> {}
