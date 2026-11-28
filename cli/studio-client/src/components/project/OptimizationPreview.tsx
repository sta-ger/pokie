import type {OptimizationEvidence} from "../../../../../src/optimization/OptimizationPolicy";
import {
    describeTunablePath,
    formatOptimizationDistance,
    formatOptimizationMetricValue,
    formatOptimizationTolerance,
    nearestOptimizationCandidate,
    optimizationScopeLabel,
    optimizationTargetLabel,
} from "../../domain/optimizationRequest";

function describeTargetVerdict(verdict: string): string {
    if (verdict === "attained") return "within tolerance";
    if (verdict === "missed") return "outside tolerance";
    return verdict;
}

function describeEvaluationVerdict(verdict: string): string {
    if (verdict === "target-missed") return "outside tolerance";
    if (verdict === "constraint-rejected") return "rejected by a constraint";
    if (verdict === "selected") return "selected";
    if (verdict === "evaluated") return "evaluated";
    return verdict;
}

function describeDefinitionDiff(status: string): string {
    if (status === "partial") return "partial — only the changed fields were compared";
    if (status === "complete") return "complete";
    if (status === "unavailable") return "unavailable";
    return status;
}

function numericMeasured(raw: unknown): number {
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") return Number(raw);
    return Number.NaN;
}

function describeMeasurementBasis(sampled: boolean, measured: number | undefined): string {
    if (sampled) return "validation estimate";
    return measured === undefined ? "closest evaluated" : "exact";
}

/** Measurements shown here come from the held-out assessment, never the search fitness. */
export function OptimizationPreview({evidence}: {evidence: OptimizationEvidence}) {
    const request = evidence.request;
    const assessment = evidence.stochastic?.assessment;
    const firstTarget = request?.targets[0];
    const nearest = firstTarget === undefined ? undefined : nearestOptimizationCandidate(firstTarget, evidence.evaluations ?? []);
    const hasSelectedCandidate = evidence.measured !== undefined;
    const constraintChecks = evidence.constraintChecks?.join("; ") ?? (hasSelectedCandidate ? "No completed validation" : "Not applicable — no candidate was selected.");
    const validation = evidence.outputValidation ?? (hasSelectedCandidate ? "Unavailable" : "Not applicable — no candidate was selected.");
    let definitionComparison = "Not applicable — no candidate was selected.";
    if (evidence.definitionDiff !== undefined) definitionComparison = describeDefinitionDiff(evidence.definitionDiff.status);
    else if (evidence.diff !== undefined) definitionComparison = "Unavailable";
    return <section aria-label="Optimization review">
        <p>Source revision: {evidence.sourceRevision}</p>
        <p>Precision: {evidence.numericRepresentation}</p>
        {request && <>
            <table aria-label="Target comparison">
                <thead><tr>{["Metric", "Units", "Rounds measured", "Requested", "Tolerance", "Measured", "Confidence interval", "Result"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{request.targets.map((target, index) => {
                    const sampled = evidence.strategy === "seeded-search-v1";
                    const result = assessment?.targets[index];
                    const measured = sampled ? result?.estimate : evidence.measured?.[index];
                    const nearestMeasured = evidence.evaluations?.reduce<number | undefined>((nearest, evaluation) => {
                        const value = numericMeasured(evaluation.measured?.[index]);
                        if (!Number.isFinite(value)) return nearest;
                        return nearest === undefined || Math.abs(value - target.value) < Math.abs(nearest - target.value) ? value : nearest;
                    }, undefined);
                    const displayed = measured ?? nearestMeasured;
                    const tolerance = target.tolerance?.value ?? 0;
                    const allowance = target.tolerance?.kind === "relative" ? Math.abs(target.value) * tolerance : tolerance;
                    let verdict = "No evaluated candidate";
                    if (displayed !== undefined) verdict = Math.abs(displayed - target.value) <= allowance ? "within tolerance" : "outside tolerance";
                    let interval = sampled ? "Assessment unavailable" : "Not applicable (exact)";
                    if (sampled && result) interval = `[${result.confidence.low}, ${result.confidence.high}]; confidence ${request.policy.sampling?.confidence}; ${result.observations} samples`;
                    return <tr key={index}>
                        <td>{optimizationTargetLabel(target, request.policy.scope)}{target.event ? ` (${target.event})` : ""}{target.bucket ? ` [${target.bucket.min}, ${target.bucket.max ?? "∞"})` : ""}</td>
                        <td>{target.unit}</td><td>{request.policy.mode}, {optimizationScopeLabel(request.policy.scope)}, stake {request.policy.stake}</td>
                        <td>{formatOptimizationMetricValue(target, target.value)}</td><td>{target.tolerance?.kind ?? "absolute"}: {formatOptimizationTolerance(target, target.tolerance?.value ?? 0)}</td>
                        <td>{displayed === undefined ? "Not evaluated" : `${formatOptimizationMetricValue(target, displayed)} ${describeMeasurementBasis(sampled, measured)}`}</td>
                        <td>{interval}</td>
                        <td>{sampled ? describeTargetVerdict(result?.verdict ?? "Unavailable") : verdict}{result && `: ${result.reason}`}</td>
                    </tr>;
                })}</tbody>
            </table>
            {evidence.strategy === "exact-finite-v1" && evidence.evaluations !== undefined && evidence.evaluations.length > 0 && (
                <table aria-label="Candidate measurements">
                    <thead><tr>{["Candidate", "Parameters", "Measured", "Verdict"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                    <tbody>{evidence.evaluations.map((evaluation, index) => <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{Object.entries(evaluation.parameters).map(([path, value]) => `${describeTunablePath(path)} = ${String(value)}`).join(", ")}</td>
                        <td>{evaluation.measured === undefined
                            ? "Not measured"
                            : evaluation.measured.map((value, targetIndex) => {
                                const target = request.targets[targetIndex];
                                const rendered = target === undefined ? String(value) : formatOptimizationMetricValue(target, value);
                                return `${target === undefined ? `metric ${targetIndex + 1}` : optimizationTargetLabel(target, request.policy.scope)}: ${rendered}`;
                            }).join("; ")}</td>
                        <td>{describeEvaluationVerdict(evaluation.verdict)}</td>
                    </tr>)}</tbody>
                </table>
            )}
            {evidence.contributions !== undefined && (
                <section aria-label="Paid-entry RTP contributions">
                    <p>
                        Exact paid-entry attribution from the measured population. Feature RTP stays in the target
                        table above; these rows describe the paid entry spin only and overlap (a line win also
                        appears under its symbol), so do not add them together.
                    </p>
                    <table aria-label="RTP contributions by symbol">
                        <thead><tr>{["Symbol", "RTP contribution", "Hit frequency", "Outcomes"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                        <tbody>{evidence.contributions.symbol.entries.map(entry => <tr key={entry.key}>
                            <td>{entry.label}</td>
                            <td>{(entry.rtpContribution * 100).toFixed(4)} pp</td>
                            <td>{(entry.hitFrequency * 100).toFixed(4)}%</td>
                            <td>{entry.outcomeCount}</td>
                        </tr>)}</tbody>
                    </table>
                    <table aria-label="RTP contributions by line">
                        <thead><tr>{["Line", "RTP contribution", "Hit frequency", "Outcomes"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                        <tbody>{evidence.contributions.line.entries.map(entry => <tr key={entry.key}>
                            <td>{entry.label}</td>
                            <td>{(entry.rtpContribution * 100).toFixed(4)} pp</td>
                            <td>{(entry.hitFrequency * 100).toFixed(4)}%</td>
                            <td>{entry.outcomeCount}</td>
                        </tr>)}</tbody>
                    </table>
                    {evidence.contributions.truncated && <p>Contribution tables are limited to their largest rows.</p>}
                </section>
            )}
            {nearest !== undefined && firstTarget !== undefined && (
                <p aria-label="Nearest evaluated candidate">
                    Nearest evaluated candidate: #{nearest.index + 1}
                    {Object.keys(nearest.evaluation.parameters ?? {}).length === 0 ? "" : ` (${Object.entries(nearest.evaluation.parameters ?? {}).map(([path, value]) => `${describeTunablePath(path)}=${String(value)}`).join(", ")})`}
                    {" — "}{formatOptimizationMetricValue(firstTarget, nearest.measured)}
                    {", deviation "}{formatOptimizationDistance(firstTarget, nearest.distance)}
                </p>
            )}
            <p>Limits: {request.policy.strategy}; candidate limit {request.policy.budget}; maximum native population {request.policy.maxOutcomes}.</p>
            {request.policy.sampling && <p>Sampling limits: search limit {request.policy.sampling.searchBudget}; validation samples {request.policy.sampling.assessmentSamples}; minimum samples {request.policy.sampling.minSamples}; minimum event count {request.policy.sampling.minEventCount}; workers {request.policy.sampling.workers}.</p>}
            <p>Tunables: {request.policy.tunables.map(field => `${describeTunablePath(field.path)}: ${field.values.join(", ")}`).join("; ")}</p>
            <p>Protected fields: {request.policy.locks.join(", ") || "None"}</p>
            <p>Protected files: {request.policy.protectedFiles?.join(", ") || "None"}</p>
            <p>Constraints: {JSON.stringify(request.policy.constraints ?? {})}</p>
        </>}
        <p>Work: {evidence.evaluated} evaluated, {evidence.rejected} rejected, {evidence.consumedWork} consumed; stop reason {evidence.stopReason ?? "exact selection"}.</p>
        <p>Constraint checks: {constraintChecks}</p>
        <p>Validation: {validation}</p>
        {evidence.diff !== undefined && evidence.diff.length > 0 && (
            <table aria-label="Parameter changes"><thead><tr><th>Path</th><th>Before</th><th>After</th></tr></thead>
                <tbody>{evidence.diff.map(change => <tr key={change.path}><td>{describeTunablePath(change.path)}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody>
            </table>
        )}
        <p>Definition comparison: {definitionComparison}</p>
        {evidence.definitionDiff?.changes.map((change, index) => <p key={index}>{change.path} [{change.classification}]: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}</p>)}
    </section>;
}
