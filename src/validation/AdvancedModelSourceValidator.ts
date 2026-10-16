import {MathDefinitionSourceReader, type MathDefinitionInput, type MathDefinitionSourceReading} from "../diff/MathDefinitionSourceReader.js";
import type {AdvancedModelValidationReport, AdvancedValidationOptions} from "./AdvancedModelValidation.js";
import {validateMathDefinitionSnapshot} from "./validateMathDefinitionSnapshot.js";
import {AnalysisBudget} from "./internal/AnalysisBudget.js";

export interface AdvancedModelSourceValidating {
    validate(input: MathDefinitionInput, options?: AdvancedValidationOptions): Promise<AdvancedModelValidationReport>;
}

/** Reads declarations only; package snapshot acquisition/release belongs to the authoritative reader. */
export class AdvancedModelSourceValidator implements AdvancedModelSourceValidating {
    private readonly reader: MathDefinitionSourceReading;
    constructor(reader: MathDefinitionSourceReading = new MathDefinitionSourceReader()) {
        this.reader = reader;
    }
    public async validate(input: MathDefinitionInput, options: AdvancedValidationOptions = {}): Promise<AdvancedModelValidationReport> {
        const budget = new AnalysisBudget(options); // Reject malformed limits before acquiring a source.
        if (options.signal?.aborted) return validateMathDefinitionSnapshot({identity: {kind: "unknown"}, support: "cancelled", fields: [], diagnostics: [], limits: ["Cancelled before source acquisition."]}, options);
        budget.check();
        const snapshot = await this.reader.read(input, {signal: options.signal, analysisOnly: true});
        return validateMathDefinitionSnapshot(snapshot, options);
    }
}
