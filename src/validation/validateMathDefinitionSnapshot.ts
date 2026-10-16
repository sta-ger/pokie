import type {MathDefinitionSnapshot} from "../diff/MathDefinitionDiff.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {AdvancedModelValidator} from "./AdvancedModelValidator.js";
import {AnalysisBudget} from "./internal/AnalysisBudget.js";
import type {AdvancedModelValidationReport, AdvancedValidationOptions} from "./AdvancedModelValidation.js";

/** Shared source adapter; extraction completeness never establishes executable fidelity. */
export async function validateMathDefinitionSnapshot(snapshot: MathDefinitionSnapshot, options: AdvancedValidationOptions = {}): Promise<AdvancedModelValidationReport> {
    const limits = new AnalysisBudget(options);
    const blueprint = snapshot.identity.kind === "blueprint";
    const supported = (blueprint && snapshot.authored !== undefined && ["complete", "partial", "invalid"].includes(snapshot.support)) || ["complete", "partial"].includes(snapshot.support) && snapshot.effective && ["reels", "rows", "symbols", "paytable"].every(key => Reflect.apply(Object.prototype.hasOwnProperty, snapshot.effective, [key])) && !snapshot.fields.some(field => field.status === "unsupported");
    // Effective comparison defaults can be forbidden as authored feature fields. Reuse the
    // retained declaration with only authoritative resolved reels/policy, never re-author defaults.
    const effective = snapshot.effective as unknown as GameBlueprint & {maxWinPolicy?: import("../diff/MathDefinitionDiff.js").MathDefinitionMaxWinPolicy};
    const model = (snapshot.authored && typeof snapshot.authored === "object" && !Array.isArray(snapshot.authored) ? {...snapshot.authored} : snapshot.authored) as unknown as GameBlueprint;
    if (effective?.reelStrips) {
        model.reelStrips = effective.reelStrips;
        Reflect.deleteProperty(model, "reelStripGeneration");
        Reflect.deleteProperty(model, "symbolWeights");
    }
    let unsupportedStatus: AdvancedModelValidationReport["status"] = "unsupported";
    if (snapshot.support === "failed") unsupportedStatus = "failed";
    if (snapshot.support === "cancelled") unsupportedStatus = "cancelled";
    if (snapshot.support === "invalid") unsupportedStatus = "invalid";
    if (snapshot.diagnostics.some(issue => issue.code === "definition-acquisition-budget-exhausted")) unsupportedStatus = "budget-exhausted";
    const report: AdvancedModelValidationReport = supported && snapshot.effective
        ? await new AdvancedModelValidator().validate({kind: "blueprint", model, maxWinPolicy: effective?.maxWinPolicy ?? (blueprint ? {type: "none", scope: "logical-round", authority: "Blueprint runtime has no payout cap"} : undefined)}, options)
        : {
            schemaVersion: 1, scope: "declared-model", adapter: snapshot.identity.kind, declarationAuthority: "Authoritative source reader; incomplete or unsupported declaration", supportedChecks: [],
            status: unsupportedStatus,
            verdict: "inconclusive", structuralValid: ["failed", "invalid"].includes(snapshot.support) ? false : null, executableFidelity: "unverified", termination: "all-path",
            assumptions: [], limitations: [...snapshot.limits], limits: limits.limits, work: limits.work,
            issues: snapshot.diagnostics.map(issue => ({...issue,
                ...(["definition-read-failed", "package-model-read-failed", "definition-normalization-failed"].includes(issue.code) ? {message: "Source declaration could not be read. Check the input and retry."} : {}), severity: issue.severity === "suggestion" ? "info" : issue.severity})),
            checks: ["reachability", "termination", "invariants"].map(id => ({id: `${id}.source-support`, path: "$", status: "unknown", severity: "warning", message: "This source does not establish a complete supported transition model; no defaults are supplied for unsupported fields.", assumptions: []})),
        };
    if (snapshot.identity.revision) report.sourceRevision = snapshot.identity.revision;
    if (!blueprint) report.adapter = `${snapshot.identity.kind}-declaration-v1`;
    report.limitations = [...new Set([...report.limitations, ...snapshot.limits])];
    if (!blueprint) {
        report.declarationAuthority = `${snapshot.identity.kind} reader: retained declaration only`;
        report.executableFidelity = "unverified";
        report.checks.push({id: "source.executable-fidelity", path: "$", status: "unknown", severity: "warning", message: "Declaration analysis does not verify arbitrary executable code, descriptor labels, restorable codecs, PAR conversion fidelity, WASM inventory/sampling or an unavailable outcome-generating state machine.", assumptions: []});
        if (report.verdict === "proved-within-assumptions") report.verdict = "inconclusive";
        if (report.status === "complete") report.status = "unsupported";
    }
    return report;
}
