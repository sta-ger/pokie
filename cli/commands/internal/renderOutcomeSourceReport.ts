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

// `outcomesource inspect` intentionally keeps its compact terminal rendering above. `pokie report`, however,
// advertises document formats, so its outcome-source route uses these format-specific documents rather than
// claiming that a plain terminal transcript is HTML.
export function renderOutcomeSourceMarkdown(targetPath: string, report: OutcomeSourceProjectReport): string {
    const lines = [
        "# Outcome Source Report",
        "",
        `- **Path**: \`${targetPath}\``,
        `- **Kind**: ${report.descriptor.kind}`,
        `- **Streaming**: ${report.descriptor.streaming ? "yes" : "no"}`,
        "",
        "## Reproducibility",
        "",
        `- **Source root**: \`${report.rootPath}\``,
        "- **Analysis**: exact enumeration of the source's declared outcome weights; no simulation was run.",
    ];

    if (report.descriptor.limitations.length > 0) {
        lines.push("", "## Limitations and recommendations", "", ...report.descriptor.limitations.map((limitation) => `- ${limitation}`));
    }
    if (report.issues.length > 0) {
        lines.push("", "## Warnings", "", ...report.issues.map((issue) => `- **${issue.severity} ${issue.code}**: ${issue.message}`));
    }
    if (report.modes.length > 0) {
        lines.push("", "## Exact analysis", "", "| Mode | RTP | Hit frequency | Standard deviation |", "| --- | --- | --- | --- |");
        report.modes.forEach((mode) => {
            lines.push(`| ${mode.modeName} | ${(mode.analysis.rtp * 100).toFixed(2)}% | ${(mode.analysis.hitFrequency * 100).toFixed(2)}% | ${mode.analysis.standardDeviation.toFixed(4)} |`);
        });
    }
    return lines.join("\n") + "\n";
}

export function renderOutcomeSourceHtml(targetPath: string, report: OutcomeSourceProjectReport): string {
    const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const list = (items: readonly string[]): string[] => ["        <ul>", ...items.map((item) => `            <li>${escapeHtml(item)}</li>`), "        </ul>"];
    const rows = report.modes.map((mode) => `            <tr><td>${escapeHtml(mode.modeName)}</td><td>${(mode.analysis.rtp * 100).toFixed(2)}%</td><td>${(mode.analysis.hitFrequency * 100).toFixed(2)}%</td><td>${mode.analysis.standardDeviation.toFixed(4)}</td></tr>`);

    return [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '    <meta charset="utf-8">',
        "    <title>Outcome Source Report</title>",
        "</head>",
        "<body>",
        "    <article>",
        "        <h1>Outcome Source Report</h1>",
        "        <table><tbody>",
        `            <tr><th scope="row">Path</th><td><code>${escapeHtml(targetPath)}</code></td></tr>`,
        `            <tr><th scope="row">Kind</th><td>${escapeHtml(report.descriptor.kind)}</td></tr>`,
        `            <tr><th scope="row">Streaming</th><td>${report.descriptor.streaming ? "yes" : "no"}</td></tr>`,
        "        </tbody></table>",
        "        <section><h2>Reproducibility</h2>",
        ...list([`Source root: ${report.rootPath}`, "Analysis: exact enumeration of declared outcome weights; no simulation was run."]),
        "        </section>",
        ...(report.descriptor.limitations.length > 0 ? ["        <section><h2>Limitations and recommendations</h2>", ...list(report.descriptor.limitations), "        </section>"] : []),
        ...(report.issues.length > 0 ? ["        <section><h2>Warnings</h2>", ...list(report.issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`)), "        </section>"] : []),
        ...(rows.length > 0 ? ["        <section><h2>Exact analysis</h2>", "        <table><thead><tr><th>Mode</th><th>RTP</th><th>Hit frequency</th><th>Standard deviation</th></tr></thead><tbody>", ...rows, "        </tbody></table></section>"] : []),
        "    </article>",
        "</body>",
        "</html>",
        "",
    ].join("\n");
}
