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
            ...(report.betMode !== undefined ? ([["Bet mode", this.escapeHtml(report.betMode)]] as Array<[string, string]>) : []),
            ["Total bet", report.totalBet.toFixed(2)],
            ["Total win", report.totalWin.toFixed(2)],
            ["RTP", `${(report.rtp * 100).toFixed(2)}%`],
            ["Hit frequency", `${(report.hitFrequency * 100).toFixed(2)}%`],
            ["Max win", report.maxWin.toFixed(2)],
            ["Duration", `${report.durationMs}ms`],
            ["Spins per second", String(report.spinsPerSecond)],
            ["Workers", String(report.workers ?? 1)],
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
            ...this.renderBreakdownSection(report),
            ...this.renderReproducibilitySection(report),
            ...this.renderListSection("Warnings", report.warnings),
            ...this.renderListSection("Recommendations", report.recommendations),
            "    </article>",
            "</body>",
            "</html>",
        ].join("\n") + "\n";
    }

    private renderBreakdownSection(report: SimulationReport): string[] {
        if (!report.breakdown) {
            return [];
        }

        const headerRow =
            "            <tr><th>Category</th><th>Rounds</th><th>Total bet</th><th>Total win</th><th>RTP</th>" +
            "<th>Contribution</th><th>Hit frequency</th><th>Max win</th></tr>";
        const rows = Object.entries(report.breakdown.components).map(([category, component]) => {
            return (
                `            <tr><td>${this.escapeHtml(category)}</td><td>${component.rounds}</td><td>${component.totalBet.toFixed(2)}</td>` +
                `<td>${component.totalWin.toFixed(2)}</td><td>${(component.rtp * 100).toFixed(2)}%</td>` +
                `<td>${(component.contribution * 100).toFixed(2)} pp</td>` +
                `<td>${(component.hitFrequency * 100).toFixed(2)}%</td><td>${component.maxWin.toFixed(2)}</td></tr>`
            );
        });

        return [
            "        <section>",
            "            <h2>Breakdown</h2>",
            "            <table>",
            "                <thead>",
            headerRow,
            "                </thead>",
            "                <tbody>",
            ...rows,
            "                </tbody>",
            "            </table>",
            "        </section>",
        ];
    }

    private renderReproducibilitySection(report: SimulationReport): string[] {
        if (!report.reproducibility) {
            return [];
        }

        const reproducibility = report.reproducibility;
        const items = [
            `Game: ${this.escapeHtml(reproducibility.game.name)} (${this.escapeHtml(reproducibility.game.id)}, v${this.escapeHtml(reproducibility.game.version)})`,
            `Seed: ${reproducibility.seed === null ? "none" : this.escapeHtml(reproducibility.seed)}`,
            `Requested rounds: ${reproducibility.requestedRounds}`,
            `Actual rounds: ${reproducibility.actualRounds}`,
            `Re-run command: <code>${this.escapeHtml(reproducibility.command)}</code>`,
        ];
        if (reproducibility.workerSeedStrategy) {
            items.push(`Worker seed strategy: ${this.escapeHtml(reproducibility.workerSeedStrategy)}`);
        }

        return [
            "        <section>",
            "            <h2>Reproducibility</h2>",
            "            <ul>",
            ...items.map((item) => `                <li>${item}</li>`),
            "            </ul>",
            "        </section>",
        ];
    }

    private renderListSection(heading: string, items: string[] | undefined): string[] {
        if (!items || items.length === 0) {
            return [];
        }

        return [
            "        <section>",
            `            <h2>${heading}</h2>`,
            "            <ul>",
            ...items.map((item) => `                <li>${this.escapeHtml(item)}</li>`),
            "            </ul>",
            "        </section>",
        ];
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
