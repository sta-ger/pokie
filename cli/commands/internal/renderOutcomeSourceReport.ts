import {formatAnalysisNumber} from "../../../src/internal/formatAnalysisNumber.js";
import type {OutcomeSourceProjectModeAnalysis, OutcomeSourceProjectReport} from "@fromstan/pokie";

// The one place a resolved "outcomeLibrary"/"stakeAdapter" project's own OutcomeSourceProjectReport (see
// OutcomeSourceProjectAnalyzer) is turned into human-readable text -- shared by ReportCommand (which reaches
// it after a mistakenly-given "pokie report" target turns out to resolve to one) and OutcomeSourceCommand's
// own "inspect" verb (a direct, first-class route to the same reader), so both print the exact same
// descriptor/limitations/issues/analysis shape rather than two independently-drifting renderings of the
// same report. "issues" wins over "modes" whenever the reader found a structural problem (see
// OutcomeSourceProjectReport's own doc comment): "modes" is always empty in that case, so there is never an
// analysis to print alongside a malformed source's own diagnostics.
//
// Coverage is deliberately part of the report, not an assumption: a native bundle records whether its
// weights came from a complete sweep ("exact") or a deterministic sample of a larger space
// ("capped-coverage"). Calling a sampled bundle "exact" would invite a producer to treat a sample estimate
// as the game's RTP, which is exactly the mistake this boundary must prevent.

function coverageLabel(mode: OutcomeSourceProjectModeAnalysis): string {
    const generator = mode.generator;
    if (generator === undefined) return "coverage metadata unavailable";
    if (generator.strategy === "exact") return "exact enumeration";
    return "sampled coverage (not exact)";
}

function coverageDetail(mode: OutcomeSourceProjectModeAnalysis): string | undefined {
    const generator = mode.generator;
    if (generator === undefined) return undefined;
    const raw = String(generator.totalOutcomeSpaceSize);
    const sampled = String(generator.sampledRawCount);
    if (generator.strategy === "exact") {
        return `every reachable outcome in ${raw} raw reel-stop combination(s) was enumerated; weights are exact counts.`;
    }
    return `${sampled} deterministic draw(s) from ${raw} possible reel-stop combination(s); RTP and payout probabilities are sample estimates, not exact game RTP.`;
}

function hasSampledCoverage(report: OutcomeSourceProjectReport): boolean {
    return report.modes.some((mode) => mode.generator?.strategy === "capped-coverage");
}

function analysisHeading(report: OutcomeSourceProjectReport): string {
    return hasSampledCoverage(report) ? "Sampled analysis" : "Outcome analysis";
}

function scopeNote(): string {
    return "Outcome weights describe one paid entry spin; feature payouts that settle in later rounds (free games, respins, Hold & Win and similar) are outside this source and must be analysed separately.";
}

function coverageRows(report: OutcomeSourceProjectReport): string[] {
    return report.modes.map((mode) => {
        const detail = coverageDetail(mode);
        return `${mode.modeName}: ${coverageLabel(mode)}${detail === undefined ? "" : ` — ${detail}`}`;
    });
}

export function renderOutcomeSourceReport(targetPath: string, report: OutcomeSourceProjectReport): string {
    const lines: string[] = [
        `"${targetPath}" is a "${report.descriptor.kind}" canonical outcome source (streaming: ${report.descriptor.streaming}).`,
        ...report.descriptor.limitations.map((limitation) => `  limitation: ${limitation}`),
        `  scope: ${scopeNote()}`,
    ];

    if (report.issues.length > 0) {
        lines.push("", `${report.issues.length} issue(s) found while reading it:`);
        for (const issue of report.issues) {
            lines.push(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }
    }

    if (report.warnings !== undefined && report.warnings.length > 0) {
        lines.push("", "Sanity warnings:");
        for (const warning of report.warnings) lines.push(`  warning  ${warning}`);
    }

    if (report.modes.length === 0) {
        return lines.join("\n");
    }

    lines.push("", `${analysisHeading(report)} (no simulation -- each outcome's own declared weight is applied):`);
    for (const mode of report.modes) {
        lines.push(
            `  mode "${mode.modeName}": ${coverageLabel(mode)}, rtp ${formatAnalysisNumber(mode.analysis.rtp * 100, 2)}%, ` +
                `hit frequency ${formatAnalysisNumber(mode.analysis.hitFrequency * 100, 2)}%, ` +
                `standard deviation ${formatAnalysisNumber(mode.analysis.standardDeviation, 4)}`,
        );
        const detail = coverageDetail(mode);
        if (detail !== undefined) lines.push(`    coverage: ${detail}`);
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
        "- **Analysis**: each outcome's own declared weight is read and applied exactly; no simulation was run.",
        `- **Scope**: ${scopeNote()}`,
    ];

    if (report.descriptor.limitations.length > 0) {
        lines.push("", "## Limitations and recommendations", "", ...report.descriptor.limitations.map((limitation) => `- ${limitation}`));
    }
    if (report.issues.length > 0) {
        lines.push("", "## Warnings", "", ...report.issues.map((issue) => `- **${issue.severity} ${issue.code}**: ${issue.message}`));
    }
    if (report.warnings !== undefined && report.warnings.length > 0) {
        lines.push("", "## Sanity warnings", "", ...report.warnings.map((warning) => `- ${warning}`));
    }
    if (report.modes.length > 0) {
        lines.push("", `## ${analysisHeading(report)}`, "");
        lines.push(...coverageRows(report).map((row) => `- ${row}`));
        lines.push("", "| Mode | RTP | Hit frequency | Standard deviation |", "| --- | --- | --- | --- |");
        report.modes.forEach((mode) => {
            lines.push(`| ${mode.modeName} | ${formatAnalysisNumber(mode.analysis.rtp * 100, 2)}% | ${formatAnalysisNumber(mode.analysis.hitFrequency * 100, 2)}% | ${formatAnalysisNumber(mode.analysis.standardDeviation, 4)} |`);
        });
    }
    return lines.join("\n") + "\n";
}

export function renderOutcomeSourceHtml(targetPath: string, report: OutcomeSourceProjectReport): string {
    const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const list = (items: readonly string[]): string[] => ["        <ul>", ...items.map((item) => `            <li>${escapeHtml(item)}</li>`), "        </ul>"];
    const rows = report.modes.map((mode) => `            <tr><td>${escapeHtml(mode.modeName)}</td><td>${escapeHtml(coverageLabel(mode))}</td><td>${formatAnalysisNumber(mode.analysis.rtp * 100, 2)}%</td><td>${formatAnalysisNumber(mode.analysis.hitFrequency * 100, 2)}%</td><td>${formatAnalysisNumber(mode.analysis.standardDeviation, 4)}</td></tr>`);

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
        ...list([`Source root: ${report.rootPath}`, "Analysis: each outcome's own declared weight is read and applied exactly; no simulation was run.", `Scope: ${scopeNote()}`]),
        "        </section>",
        ...(report.descriptor.limitations.length > 0 ? ["        <section><h2>Limitations and recommendations</h2>", ...list(report.descriptor.limitations), "        </section>"] : []),
        ...(report.issues.length > 0 ? ["        <section><h2>Warnings</h2>", ...list(report.issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`)), "        </section>"] : []),
        ...(report.warnings !== undefined && report.warnings.length > 0 ? ["        <section><h2>Sanity warnings</h2>", ...list(report.warnings), "        </section>"] : []),
        ...(rows.length > 0 ? [
            `        <section><h2>${escapeHtml(analysisHeading(report))}</h2>`,
            "        <h3>Coverage</h3>",
            ...list(coverageRows(report)),
            "        <table><thead><tr><th>Mode</th><th>Coverage</th><th>RTP</th><th>Hit frequency</th><th>Standard deviation</th></tr></thead><tbody>",
            ...rows,
            "        </tbody></table></section>",
        ] : []),
        "    </article>",
        "</body>",
        "</html>",
        "",
    ].join("\n");
}
