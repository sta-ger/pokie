import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ParSheetImportResult} from "./ParSheetImportResult.js";

/** Current observations plus retained conversion history; never a substitute for model validation. */
export type ParSheetConversionReport = {
    readonly issues: readonly ValidationIssue[];
    readonly facts: NonNullable<ParSheetImportResult["conversionEvidence"]>["facts"];
    readonly losslessEligible: boolean;
};

export function parSheetConversionReport(issues: readonly ValidationIssue[], evidence?: ParSheetImportResult["conversionEvidence"] | ParSheetConversionReport): ParSheetConversionReport {
    // A freshly recomputed provenance-present notice describes this read, not a
    // conversion loss. Do not accumulate a new export timestamp at every republication.
    const conversionIssues = issues.filter(issue => issue.code !== "parsheet-provenance-present");
    const uniqueIssues = conversionIssues.filter((issue, index) => conversionIssues.findIndex(other => JSON.stringify(other) === JSON.stringify(issue)) === index);
    const retainedFacts = (evidence?.facts ?? []).filter(fact => fact.code !== "parsheet-provenance-present");
    const facts = retainedFacts.filter((fact, index) => retainedFacts.findIndex(other => JSON.stringify(other) === JSON.stringify(fact)) === index);
    for (const issue of uniqueIssues) {
        if (!facts.some(fact => fact.code === issue.code && fact.message === issue.message)) facts.push({kind: "diagnostic", code: issue.code, message: issue.message, ...(issue.details === undefined ? {} : {details: issue.details})});
    }
    return {
        issues: uniqueIssues, facts,
        losslessEligible: evidence?.losslessEligible !== false && !uniqueIssues.some(issue => issue.severity === "error" || issue.details?.losslessEligible === false) && !facts.some(fact => fact.kind !== "diagnostic"),
    };
}

/** Parse persisted history without coercing malformed declarations into eligibility. */
export function parseParSheetConversionReport(value: unknown): ParSheetConversionReport {
    const report = value as Partial<ParSheetConversionReport> | null;
    if (!report || typeof report.losslessEligible !== "boolean" || !Array.isArray(report.issues) || !Array.isArray(report.facts) ||
        !report.issues.every(issue => issue && typeof issue.code === "string" && typeof issue.message === "string" && ["info", "warning", "error"].includes(issue.severity) && (issue.details === undefined || (issue.details !== null && typeof issue.details === "object"))) ||
        !report.facts.every(fact => fact && typeof fact.code === "string" && typeof fact.message === "string" && ["diagnostic", "ignored", "formulaMaterialized", "inferredOrDefaulted"].includes(fact.kind))) {
        throw new Error("Malformed PAR conversion history.");
    }
    return parSheetConversionReport(report.issues, report as ParSheetConversionReport);
}
