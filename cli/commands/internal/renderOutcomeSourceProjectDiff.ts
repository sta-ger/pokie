import {OutcomeSourceProjectDiff, OutcomeSourceProjectMetricDiff} from "pokie";

function formatSigned(value: number, decimals: number): string {
    const rounded = value.toFixed(decimals);
    return value > 0 ? `+${rounded}` : rounded;
}

function formatPercentMetric(metric: OutcomeSourceProjectMetricDiff): string {
    const left = (metric.left * 100).toFixed(2);
    const right = (metric.right * 100).toFixed(2);
    const deltaPp = formatSigned(metric.delta * 100, 2);
    const percent = metric.percentDelta === null ? "n/a" : `${formatSigned(metric.percentDelta, 2)}%`;
    return `${left}% -> ${right}% (${deltaPp} pp, ${percent})`;
}

function formatMetric(metric: OutcomeSourceProjectMetricDiff, decimals: number): string {
    const left = metric.left.toFixed(decimals);
    const right = metric.right.toFixed(decimals);
    const delta = formatSigned(metric.delta, decimals);
    const percent = metric.percentDelta === null ? "n/a" : `${formatSigned(metric.percentDelta, 2)}%`;
    return `${left} -> ${right} (${delta}, ${percent})`;
}

// Renders diffOutcomeSourceProjects()'s own OutcomeSourceProjectDiff -- the "outcomesource diff" verb's
// summary counterpart to DiffCommand's own printSummary/StakeEngineCommand's own printDiffSummary, over
// exactly the shared core metrics both a native bundle's and a Stake Engine export's own exact analysis
// already carry (see OutcomeSourceProjectModeDiff's own doc comment).
export function renderOutcomeSourceProjectDiff(diff: OutcomeSourceProjectDiff): string {
    const lines: string[] = [`Diffing "${diff.left.rootPath}" (${diff.left.kind}) -> "${diff.right.rootPath}" (${diff.right.kind})`];

    if (diff.left.issues.length > 0) {
        lines.push("", `Errors reading "${diff.left.rootPath}" (${diff.left.issues.length}):`);
        for (const issue of diff.left.issues) {
            lines.push(`  - ${issue.code}: ${issue.message}`);
        }
    }
    if (diff.right.issues.length > 0) {
        lines.push("", `Errors reading "${diff.right.rootPath}" (${diff.right.issues.length}):`);
        for (const issue of diff.right.issues) {
            lines.push(`  - ${issue.code}: ${issue.message}`);
        }
    }

    if (diff.onlyInLeft.length > 0) {
        lines.push("", `Modes only in the left source: ${diff.onlyInLeft.join(", ")}`);
    }
    if (diff.onlyInRight.length > 0) {
        lines.push(`Modes only in the right source: ${diff.onlyInRight.join(", ")}`);
    }

    for (const [modeName, modeDiff] of Object.entries(diff.perMode)) {
        lines.push("", `Mode "${modeName}":`);
        lines.push(`  rtp                 ${formatPercentMetric(modeDiff.rtp)}`);
        lines.push(`  hit frequency       ${formatPercentMetric(modeDiff.hitFrequency)}`);
        lines.push(`  zero win frequency  ${formatPercentMetric(modeDiff.zeroWinFrequency)}`);
        lines.push(`  variance            ${formatMetric(modeDiff.variance, 6)}`);
        lines.push(`  standard deviation  ${formatMetric(modeDiff.standardDeviation, 4)}`);
        lines.push(`  max win probability ${formatPercentMetric(modeDiff.maxWinProbability)}`);
    }

    return lines.join("\n");
}
