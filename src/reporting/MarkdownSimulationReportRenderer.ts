import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportRendering} from "./SimulationReportRendering.js";

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
            `- **Total bet**: ${report.totalBet.toFixed(2)}`,
            `- **Total win**: ${report.totalWin.toFixed(2)}`,
            `- **RTP**: ${(report.rtp * 100).toFixed(2)}%`,
            `- **Hit frequency**: ${(report.hitFrequency * 100).toFixed(2)}%`,
            `- **Max win**: ${report.maxWin.toFixed(2)}`,
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
}
