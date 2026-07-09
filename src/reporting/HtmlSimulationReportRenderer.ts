import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportRendering} from "./SimulationReportRendering.js";

export class HtmlSimulationReportRenderer implements SimulationReportRendering {
    public render(report: SimulationReport): string {
        const title = `Simulation Report: ${this.escapeHtml(report.game.name)}`;
        const rows: Array<[string, string]> = [
            ["Game id", this.escapeHtml(report.game.id)],
            ["Game version", this.escapeHtml(report.game.version)],
            ["Requested rounds", String(report.requestedRounds)],
            ["Actual rounds", String(report.rounds)],
            ["Seed", report.seed === null ? "none" : this.escapeHtml(report.seed)],
            ["Total bet", report.totalBet.toFixed(2)],
            ["Total win", report.totalWin.toFixed(2)],
            ["RTP", `${(report.rtp * 100).toFixed(2)}%`],
            ["Hit frequency", `${(report.hitFrequency * 100).toFixed(2)}%`],
            ["Max win", report.maxWin.toFixed(2)],
            ["Duration", `${report.durationMs}ms`],
            ["Spins per second", String(report.spinsPerSecond)],
        ];
        const tableRows = rows.map(([label, value]) => `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("\n");

        return [
            "<!DOCTYPE html>",
            '<html lang="en">',
            "<head>",
            '    <meta charset="utf-8">',
            `    <title>${title}</title>`,
            "</head>",
            "<body>",
            "    <article>",
            `        <h1>${title}</h1>`,
            "        <table>",
            "            <tbody>",
            tableRows,
            "            </tbody>",
            "        </table>",
            "    </article>",
            "</body>",
            "</html>",
        ].join("\n") + "\n";
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
}
