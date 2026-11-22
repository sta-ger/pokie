import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ParSheetMathAnalysis} from "./ParSheetMathAnalysis.js";

/** Identity of the file exclusively published by this invocation, for guarded caller rollback. */
export type ParSheetFilePublication = {readonly path: string; readonly dev: number; readonly ino: number};

export type ParSheetExportOptions = {
    /** A republished workbook cannot upgrade previously ineligible conversion evidence. */
    readonly losslessEligible?: boolean;
    readonly conversionReport?: import("./ParSheetConversionReport.js").ParSheetConversionReport;
    readonly signal?: AbortSignal;
    /** Include exact math sheets when the source is small enough to enumerate; unavailable math is explained in MathSummary. */
    readonly includeMath?: boolean;
    /** Exact outcome cap for the math sheets (default: the shared draft-preview cap). */
    readonly maxMathOutcomes?: number;
    /** Precomputed math for callers that already ran the same analysis; avoids a duplicate enumeration. */
    readonly mathAnalysis?: ParSheetMathAnalysis;
    /** Synchronous ownership notification; the export may still fail or cancel before resolving. */
    readonly onPublication?: (publication: ParSheetFilePublication) => void;
    readonly onProgress?: (progress: {readonly message: string}) => void;
};

export interface ParSheetExporting {
    // "blueprint" is `unknown`, not `GameBlueprint` — exportToFile runs full validation itself (the
    // same GameBlueprintValidator "pokie build"/ParSheetImporter use) rather than trusting the caller
    // to have already checked it, so it's just as safe to call directly as it is via the CLI. See its
    // own doc comment for the exact preflight order and the "no partial write" guarantee.
    //
    // "sourcePath" records Meta provenance and identifies any prior conversion-evidence sidecar.
    // Export never changes that authored source.
    exportToFile(blueprint: unknown, filePath: string, sourcePath?: string, options?: ParSheetExportOptions): Promise<ValidationIssue[]>;
}
