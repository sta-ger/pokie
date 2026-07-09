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
        ];

        return lines.join("\n") + "\n";
    }
}
