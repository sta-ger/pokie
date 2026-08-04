import {OutcomeSourceProjectReport} from "pokie";

// The one place a resolved "outcomeLibrary"/"stakeAdapter" project's own OutcomeSourceProjectReport (see
// OutcomeSourceProjectAnalyzer) is turned into human-readable text -- shared by ReportCommand (which reaches
// it after a mistakenly-given "pokie report" target turns out to resolve to one) and OutcomeSourceCommand's
// own "inspect" verb (a direct, first-class route to the same reader), so both print the exact same
// descriptor/limitations/issues/exact-analysis shape rather than two independently-drifting renderings of the
// same report. "issues" wins over "modes" whenever the reader found a structural problem (see
// OutcomeSourceProjectReport's own doc comment): "modes" is always empty in that case, so there is never an
// exact analysis to print alongside a malformed source's own diagnostics.
export function renderOutcomeSourceReport(targetPath: string, report: OutcomeSourceProjectReport): string {
    const lines: string[] = [
        `"${targetPath}" is a "${report.descriptor.kind}" canonical outcome source (streaming: ${report.descriptor.streaming}).`,
        ...report.descriptor.limitations.map((limitation) => `  limitation: ${limitation}`),
    ];

    if (report.issues.length > 0) {
        lines.push("", `${report.issues.length} issue(s) found while reading it:`);
        for (const issue of report.issues) {
            lines.push(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }
    }

    if (report.modes.length === 0) {
        return lines.join("\n");
    }

    lines.push("", "Exact analysis (no simulation -- every outcome's own weight, enumerated exactly):");
    for (const mode of report.modes) {
        lines.push(
            `  mode "${mode.modeName}": rtp ${(mode.analysis.rtp * 100).toFixed(2)}%, ` +
                `hit frequency ${(mode.analysis.hitFrequency * 100).toFixed(2)}%, ` +
                `standard deviation ${mode.analysis.standardDeviation.toFixed(4)}`,
        );
    }

    return lines.join("\n");
}
