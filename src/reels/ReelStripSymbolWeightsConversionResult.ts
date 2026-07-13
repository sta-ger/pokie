import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";
import type {ReelStripSymbolWeightsConversionDiagnostic} from "./ReelStripSymbolWeightsConversionDiagnostic.js";

export type ReelStripSymbolWeightsConversionResult = {
    success: boolean;
    symbolCounts?: Record<string, number>;
    violations: ReelStripConstraintViolation[];
    diagnostic?: ReelStripSymbolWeightsConversionDiagnostic;
};
