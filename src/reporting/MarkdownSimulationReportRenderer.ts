import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportRendering} from "./SimulationReportRendering.js";
import type {SimulationReportSet} from "./SimulationReportSet.js";

export class MarkdownSimulationReportRenderer implements SimulationReportRendering {
    public render(report: SimulationReport): string {
        const lines = [
            `# Simulation Report: ${report.game.name}`,
            "",
            `- **Game id**: \`${report.game.id}\``,
            `- **Game version**: ${report.game.version}`,
            `- **Requested rounds**: ${report.requestedRounds}`,
            `- **Actual rounds**: ${report.rounds}`,
            `- **Seed**: ${report.seed ?? "_none_"}`,
            ...(report.betMode !== undefined ? [`- **Bet mode**: ${report.betMode}`] : []),
            `- **Total bet**: ${report.totalBet.toFixed(2)}`,
            `- **Total win**: ${report.totalWin.toFixed(2)}`,
            `- **RTP**: ${(report.rtp * 100).toFixed(2)}%`,
            ...(report.targetRtp !== undefined
                ? [
                    `- **RTP target**: ${(report.targetRtp * 100).toFixed(2)}%`,
                    `- **RTP deviation**: ${((report.rtpDeviation as number) * 100).toFixed(2)} pp`,
                ]
                : []),
            `- **Hit frequency**: ${(report.hitFrequency * 100).toFixed(2)}%`,
            `- **Average payout**: ${(report.averagePayout ?? 0).toFixed(2)}`,
            `- **Max win**: ${report.maxWin.toFixed(2)}`,
            ...(report.volatility !== undefined ? [`- **Volatility**: ${report.volatility.toFixed(2)}`] : []),
            ...(report.maxWinFrequency !== undefined ? [`- **Max win frequency**: ${(report.maxWinFrequency * 100).toFixed(4)}%`] : []),
            `- **Duration**: ${report.durationMs}ms`,
            `- **Spins per second**: ${report.spinsPerSecond}`,
            `- **Workers**: ${report.workers ?? 1}`,
        ];

        if (report.breakdown) {
            lines.push(
                "",
                "## Breakdown",
                "",
                "| Category | Rounds | Total bet | Total win | RTP | Contribution | Hit frequency | Max win |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |",
            );
            Object.entries(report.breakdown.components).forEach(([category, component]) => {
                lines.push(
                    `| ${category} | ${component.rounds} | ${component.totalBet.toFixed(2)} | ${component.totalWin.toFixed(2)} | ` +
                        `${(component.rtp * 100).toFixed(2)}% | ${(component.contribution * 100).toFixed(2)} pp | ` +
                        `${(component.hitFrequency * 100).toFixed(2)}% | ${component.maxWin.toFixed(2)} |`,
                );
            });
        }

        if (report.reproducibility) {
            const reproducibility = report.reproducibility;
            lines.push(
                "",
                "## Reproducibility",
                "",
                `- **Game**: ${reproducibility.game.name} (\`${reproducibility.game.id}\`, v${reproducibility.game.version})`,
                `- **Seed**: ${reproducibility.seed ?? "_none_"}`,
                `- **Requested rounds**: ${reproducibility.requestedRounds}`,
                `- **Actual rounds**: ${reproducibility.actualRounds}`,
                `- **Re-run command**: \`${reproducibility.command}\``,
            );
            if (reproducibility.workerSeedStrategy) {
                lines.push(`- **Worker seed strategy**: ${reproducibility.workerSeedStrategy}`);
            }
        }

        if (report.warnings && report.warnings.length > 0) {
            lines.push("", "## Warnings", "", ...report.warnings.map((warning) => `- ${warning}`));
        }

        if (report.recommendations && report.recommendations.length > 0) {
            lines.push("", "## Recommendations", "", ...report.recommendations.map((recommendation) => `- ${recommendation}`));
        }

        return lines.join("\n") + "\n";
    }

    // Side-by-side headline metrics across every mode in the set, followed by each mode's own full
    // section (its complete render() output, demoted one heading level so it nests under "## Mode: id"
    // rather than colliding with it) -- no metric here is computed freshly, every value is read
    // straight off each mode's own already-built SimulationReport. Deliberately no "overall"/blended
    // column -- see SimulationReportSet's own doc comment on why.
    public renderSet(reportSet: SimulationReportSet): string {
        const modeEntries = Object.entries(reportSet.modes);
        const hasTargetRtp = modeEntries.some(([, report]) => report.targetRtp !== undefined);

        const lines = [
            `# Simulation Report Set: ${reportSet.game.name}`,
            "",
            `- **Game id**: \`${reportSet.game.id}\``,
            `- **Game version**: ${reportSet.game.version}`,
            `- **Requested rounds**: ${reportSet.requestedRounds}`,
            `- **Seed**: ${reportSet.seed ?? "_none_"}`,
            `- **Workers**: ${reportSet.workers ?? 1}`,
            `- **Modes compared**: ${modeEntries.map(([modeId]) => modeId).join(", ")}`,
            "",
            "## Comparison",
            "",
            `| Metric | ${modeEntries.map(([modeId]) => modeId).join(" | ")} |`,
            `| --- | ${modeEntries.map(() => "---").join(" | ")} |`,
            this.comparisonRow("RTP (observed)", modeEntries, (report) => `${(report.rtp * 100).toFixed(2)}%`),
        ];

        if (hasTargetRtp) {
            lines.push(
                this.comparisonRow("RTP (target)", modeEntries, (report) =>
                    report.targetRtp !== undefined ? `${(report.targetRtp * 100).toFixed(2)}%` : "–",
                ),
                this.comparisonRow("RTP deviation", modeEntries, (report) =>
                    report.rtpDeviation !== undefined ? `${(report.rtpDeviation * 100).toFixed(2)} pp` : "–",
                ),
            );
        }

        lines.push(
            this.comparisonRow("Stake (avg bet)", modeEntries, (report) => (report.averageBet ?? 0).toFixed(2)),
            this.comparisonRow("Hit / feature rate", modeEntries, (report) => `${(report.hitFrequency * 100).toFixed(2)}%`),
            this.comparisonRow("Average payout", modeEntries, (report) => (report.averagePayout ?? 0).toFixed(2)),
            this.comparisonRow("Max win", modeEntries, (report) => report.maxWin.toFixed(2)),
            this.comparisonRow("Volatility", modeEntries, (report) => (report.volatility ?? 0).toFixed(2)),
            this.comparisonRow("Max win frequency", modeEntries, (report) => `${((report.maxWinFrequency ?? 0) * 100).toFixed(4)}%`),
        );

        modeEntries.forEach(([modeId, report]) => {
            lines.push("", `## Mode: ${modeId}`, "", this.demoteHeadings(this.render(report)));
        });

        return lines.join("\n") + "\n";
    }

    private comparisonRow(label: string, modeEntries: [string, SimulationReport][], format: (report: SimulationReport) => string): string {
        return `| ${label} | ${modeEntries.map(([, report]) => format(report)).join(" | ")} |`;
    }

    // Prepends one "#" to every heading line so an embedded per-mode render() nests correctly under
    // its own "## Mode: id" heading (its title becomes "##", its own "## Breakdown"/etc become "###"),
    // instead of colliding with the mode headings at the same level.
    private demoteHeadings(rendered: string): string {
        return rendered.replace(/^(#+ )/gm, "#$1");
    }
}
