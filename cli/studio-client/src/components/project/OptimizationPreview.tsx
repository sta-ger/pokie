import type {OptimizationEvidence} from "../../../../../src/optimization/OptimizationPolicy";

/** Measurements shown here come from the held-out assessment, never the search fitness. */
export function OptimizationPreview({evidence}: {evidence: OptimizationEvidence}) {
    const request = evidence.request;
    const assessment = evidence.stochastic?.assessment;
    return <section aria-label="Optimization review">
        <p>Source revision: {evidence.sourceRevision}</p>
        <p>Precision: {evidence.numericRepresentation}</p>
        {request && <>
            <table aria-label="Target comparison">
                <thead><tr>{["Metric", "Units", "Population", "Requested", "Tolerance", "Measured", "Confidence interval", "Verdict"].map(label => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{request.targets.map((target, index) => {
                    const sampled = evidence.strategy === "seeded-search-v1";
                    const result = assessment?.targets[index];
                    const measured = sampled ? result?.estimate : evidence.measured?.[index];
                    const tolerance = target.tolerance?.value ?? 0;
                    const allowance = target.tolerance?.kind === "relative" ? Math.abs(target.value) * tolerance : tolerance;
                    let verdict = "Unavailable";
                    if (measured !== undefined) verdict = Math.abs(measured - target.value) <= allowance ? "attained" : "missed";
                    let interval = sampled ? "Assessment unavailable" : "Not applicable (exact)";
                    if (sampled && result) interval = `[${result.confidence.low}, ${result.confidence.high}]; confidence ${request.policy.sampling?.confidence}; ${result.observations} observations`;
                    return <tr key={index}>
                        <td>{target.metric}{target.event ? ` (${target.event})` : ""}{target.bucket ? ` [${target.bucket.min}, ${target.bucket.max ?? "∞"})` : ""}</td>
                        <td>{target.unit}</td><td>{request.policy.mode}, {request.policy.scope}, stake {request.policy.stake}</td>
                        <td>{target.value}</td><td>{target.tolerance?.kind ?? "absolute"}: {tolerance}</td>
                        <td>{measured ?? "Unavailable"} {sampled ? "held-out estimate" : "exact"}</td>
                        <td>{interval}</td>
                        <td>{sampled ? result?.verdict ?? "Unavailable" : verdict}{result && `: ${result.reason}`}</td>
                    </tr>;
                })}</tbody>
            </table>
            <p>Limits: {request.policy.strategy}; candidate budget {request.policy.budget}; maximum native population {request.policy.maxOutcomes}.</p>
            {request.policy.sampling && <p>Sampling limits: search budget {request.policy.sampling.searchBudget}; held-out samples {request.policy.sampling.assessmentSamples}; minimum samples {request.policy.sampling.minSamples}; minimum event count {request.policy.sampling.minEventCount}; workers {request.policy.sampling.workers}.</p>}
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
