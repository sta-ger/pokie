import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripGenerationDiagnostic} from "./ReelStripGenerationDiagnostic.js";

export type ReelStripGenerationResult = {
    success: boolean;
    strip?: ReelStripDefinition;
    attemptsUsed: number;
    diagnostics: ReelStripGenerationDiagnostic[];
};
