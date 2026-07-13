import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripGenerationDiagnostic} from "./ReelStripGenerationDiagnostic.js";
import type {ReelStripSymbolWeightsConversionDiagnostic} from "./ReelStripSymbolWeightsConversionDiagnostic.js";

export type ReelStripGenerationResult = {
    success: boolean;
    strip?: ReelStripDefinition;
    attemptsUsed: number;
    diagnostics: ReelStripGenerationDiagnostic[];
    // Present only when the result came from ReelStripGenerator.generateFromSymbolWeights.
    symbolWeightsConversion?: ReelStripSymbolWeightsConversionDiagnostic;
};
