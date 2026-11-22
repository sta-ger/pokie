import type {OptimizationEvidence} from "../../../../../src/optimization/OptimizationPolicy";
import {describeTunablePath, formatOptimizationMetricValue, formatOptimizationTolerance, nearestOptimizationCandidate} from "../../domain/optimizationRequest";

/** Measurements shown here come from the held-out assessment, never the search fitness. */
export function OptimizationPreview({evidence}: {evidence: OptimizationEvidence}) {
    const request = evidence.request;
    const assessment = evidence.stochastic?.assessment;
    const firstTarget = request?.targets[0];
    const nearest = firstTarget === undefined ? undefined : nearestOptimizationCandidate(firstTarget, evidence.evaluations ?? []);
    return <section aria-label="Optimization review">
        <p>Source revision: {evidence.sourceRevision}</p>
        <p>Precision: {evidence.numericRepresentation}</p>
        {request && <>
            <table aria-label="Target comparison">
                <thead><tr>{["Metric", "Units", "Population", "Requested", "Tolerance", "Measured", "Confidence interval", "Result"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{request.targets.map((target, index) => {
                    const sampled = evidence.strategy === "seeded-search-v1";
                    const result = assessment?.targets[index];
                    const measured = sampled ? result?.estimate : evidence.measured?.[index];
                    const tolerance = target.tolerance?.value ?? 0;
                    const allowance = target.tolerance?.kind === "relative" ? Math.abs(target.value) * tolerance : tolerance;
                    let verdict = "Unavailable";
                    if (measured !== undefined) verdict = Math.abs(measured - target.value) <= allowance ? "attained" : "missed";
                    let interval = sampled ? "Assessment unavailable" : "Not applicable (exact)";
                    if (sampled && result) interval = `[${result.confidence.low}, ${result.confidence.high}]; confidence ${request.policy.sampling?.confidence}; ${result.observations} samples`;
                    return <tr key={index}>
                        <td>{target.metric}{target.event ? ` (${target.event})` : ""}{target.bucket ? ` [${target.bucket.min}, ${target.bucket.max ?? "∞"})` : ""}</td>
                        <td>{target.unit}</td><td>{request.policy.mode}, {request.policy.scope}, stake {request.policy.stake}</td>
                        <td>{formatOptimizationMetricValue(target, target.value)}</td><td>{target.tolerance?.kind ?? "absolute"}: {formatOptimizationTolerance(target, target.tolerance?.value ?? 0)}</td>
                        <td>{measured === undefined ? "Unavailable" : `${formatOptimizationMetricValue(target, measured)} ${sampled ? "validation estimate" : "exact"}`}</td>
                        <td>{interval}</td>
                        <td>{sampled ? result?.verdict ?? "Unavailable" : verdict}{result && `: ${result.reason}`}</td>
                    </tr>;
                })}</tbody>
            </table>
            {evidence.strategy === "exact-finite-v1" && evidence.evaluations !== undefined && evidence.evaluations.length > 0 && (
                <table aria-label="Candidate measurements">
                    <thead><tr>{["Candidate", "Parameters", "Measured", "Verdict"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                    <tbody>{evidence.evaluations.map((evaluation, index) => <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{Object.entries(evaluation.parameters).map(([path, value]) => `${describeTunablePath(path)}=${String(value)}`).join(", ")}</td>
                        <td>{evaluation.measured === undefined
                            ? "Not measured"
                            : evaluation.measured.map((value, targetIndex) => {
                                const target = request.targets[targetIndex];
                                const rendered = target === undefined ? String(value) : formatOptimizationMetricValue(target, value);
                                return `${target?.metric ?? `metric ${targetIndex + 1}`}: ${rendered}`;
                            }).join("; ")}</td>
                        <td>{evaluation.verdict}</td>
                    </tr>)}</tbody>
                </table>
            )}
            {nearest !== undefined && firstTarget !== undefined && (
                <p aria-label="Nearest evaluated candidate">
                    Nearest evaluated candidate: #{nearest.index + 1}
                    {Object.keys(nearest.evaluation.parameters ?? {}).length === 0 ? "" : ` (${Object.entries(nearest.evaluation.parameters ?? {}).map(([path, value]) => `${describeTunablePath(path)}=${String(value)}`).join(", ")})`}
                    {" — "}{formatOptimizationMetricValue(firstTarget, nearest.measured)}
                    {", miss "}{formatOptimizationMetricValue(firstTarget, nearest.distance)}
                </p>
            )}
            <p>Limits: {request.policy.strategy}; candidate limit {request.policy.budget}; maximum native population {request.policy.maxOutcomes}.</p>
            {request.policy.sampling && <p>Sampling limits: search limit {request.policy.sampling.searchBudget}; validation samples {request.policy.sampling.assessmentSamples}; minimum samples {request.policy.sampling.minSamples}; minimum event count {request.policy.sampling.minEventCount}; workers {request.policy.sampling.workers}.</p>}
            <p>Tunables: {request.policy.tunables.map(field => `${field.path}: ${field.values.join(", ")}`).join("; ")}</p>
            <p>Locks: {request.policy.locks.join(", ") || "None"}</p>
            <p>Protected files: {request.policy.protectedFiles?.join(", ") || "None"}</p>
            <p>Constraints: {JSON.stringify(request.policy.constraints ?? {})}</p>
        </>}
        <p>Work: {evidence.evaluated} evaluated, {evidence.rejected} rejected, {evidence.consumedWork} consumed; stop reason {evidence.stopReason ?? "exact selection"}.</p>
        <p>Constraint checks: {evidence.constraintChecks?.join("; ") || "No completed validation"}</p>
        <p>Validation: {evidence.outputValidation ?? "Unavailable"}</p>
        <table aria-label="Parameter changes"><thead><tr><th>Path</th><th>Before</th><th>After</th></tr></thead>
            <tbody>{evidence.diff?.map(change => <tr key={change.path}><td>{change.path}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody>
        </table>
        <p>Definition comparison: {evidence.definitionDiff?.status ?? "Unavailable; native parameter changes are shown above"}</p>
        {evidence.definitionDiff?.changes.map((change, index) => <p key={index}>{change.path} [{change.classification}]: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}</p>)}
    </section>;
}
