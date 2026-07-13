import type {ReelStripSymbolWeightsConversionRequest} from "./ReelStripSymbolWeightsConversionRequest.js";
import type {ReelStripSymbolWeightsConversionResult} from "./ReelStripSymbolWeightsConversionResult.js";

export interface ReelStripSymbolWeightsConverter {
    convert(request: ReelStripSymbolWeightsConversionRequest): ReelStripSymbolWeightsConversionResult;
}
