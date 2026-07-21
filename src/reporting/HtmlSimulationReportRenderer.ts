import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportRendering} from "./SimulationReportRendering.js";
import type {SimulationReportSet} from "./SimulationReportSet.js";

export class HtmlSimulationReportRenderer implements SimulationReportRendering {
    public render(report: SimulationReport): string {
        const title = `Simulation Report: ${this.escapeHtml(report.game.name)}`;

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
            ...this.renderReportBody(report),
            "    </article>",
            "</body>",
            "</html>",
        ].join("\n") + "\n";
    }

    // Side-by-side headline metrics across every mode in the set, followed by each mode's own full
    // body (renderReportBody() -- the same rows/sections render() itself uses) nested under its own
    // "Mode: id" section -- no metric here is computed freshly, every value is read straight off each
    // mode's own already-built SimulationReport. Deliberately no "overall"/blended column -- see
    // SimulationReportSet's own doc comment on why.
    public renderSet(reportSet: SimulationReportSet): string {
        const title = `Simulation Report Set: ${this.escapeHtml(reportSet.game.name)}`;
        const modeEntries = Object.entries(reportSet.modes);

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
            ...this.renderSetSummary(reportSet, modeEntries),
            ...this.renderComparisonSection(modeEntries),
            ...modeEntries.flatMap(([modeId, report]) => [
                "        <section>",
                `            <h2>Mode: ${this.escapeHtml(modeId)}</h2>`,
                ...this.renderReportBody(report),
                "        </section>",
            ]),
            "    </article>",
            "</body>",
            "</html>",
        ].join("\n") + "\n";
    }

    private renderReportBody(report: SimulationReport): string[] {
        const rows: Array<[string, string]> = [
            ["Game id", this.escapeHtml(report.game.id)],
            ["Game version", this.escapeHtml(report.game.version)],
            ["Requested rounds", String(report.requestedRounds)],
            ["Actual rounds", String(report.rounds)],
            ...(report.stopReason !== undefined ? ([["Stop reason", this.escapeHtml(report.stopReason)]] as Array<[string, string]>) : []),
            ["Seed", report.seed === null ? "none" : this.escapeHtml(report.seed)],
            ...(report.betMode !== undefined ? ([["Bet mode", this.escapeHtml(report.betMode)]] as Array<[string, string]>) : []),
            ["Total bet", report.totalBet.toFixed(2)],
            ["Total win", report.totalWin.toFixed(2)],
            ["RTP", `${(report.rtp * 100).toFixed(2)}%`],
            ...(report.targetRtp !== undefined
                ? ([
                    ["RTP target", `${(report.targetRtp * 100).toFixed(2)}%`],
                    ["RTP deviation", `${((report.rtpDeviation as number) * 100).toFixed(2)} pp`],
                ] as Array<[string, string]>)
                : []),
            ["Hit frequency", `${(report.hitFrequency * 100).toFixed(2)}%`],
            ["Average payout", (report.averagePayout ?? 0).toFixed(2)],
            ["Max win", report.maxWin.toFixed(2)],
            ...(report.volatility !== undefined ? ([["Volatility", report.volatility.toFixed(2)]] as Array<[string, string]>) : []),
            ...(report.maxWinFrequency !== undefined
                ? ([["Max win frequency", `${(report.maxWinFrequency * 100).toFixed(4)}%`]] as Array<[string, string]>)
                : []),
            ["Duration", `${report.durationMs}ms`],
            ["Spins per second", String(report.spinsPerSecond)],
            ["Workers", String(report.workers ?? 1)],
        ];
        const tableRows = rows.map(([label, value]) => `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("\n");

        return [
            "        <table>",
            "            <tbody>",
            tableRows,
            "            </tbody>",
            "        </table>",
            ...this.renderBreakdownSection(report),
            ...this.renderJackpotSection(report),
            ...this.renderConvergenceSection(report),
            ...this.renderReproducibilitySection(report),
            ...this.renderListSection("Warnings", report.warnings),
            ...this.renderListSection("Recommendations", report.recommendations),
        ];
    }

    private renderSetSummary(reportSet: SimulationReportSet, modeEntries: Array<[string, SimulationReport]>): string[] {
        const rows: Array<[string, string]> = [
            ["Game id", this.escapeHtml(reportSet.game.id)],
            ["Game version", this.escapeHtml(reportSet.game.version)],
            ["Requested rounds", String(reportSet.requestedRounds)],
            ["Seed", reportSet.seed === null ? "none" : this.escapeHtml(reportSet.seed)],
            ["Workers", String(reportSet.workers ?? 1)],
            ["Modes compared", modeEntries.map(([modeId]) => this.escapeHtml(modeId)).join(", ")],
        ];
        const tableRows = rows.map(([label, value]) => `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("\n");

        return ["        <table>", "            <tbody>", tableRows, "            </tbody>", "        </table>"];
    }

    private renderComparisonSection(modeEntries: Array<[string, SimulationReport]>): string[] {
        const hasTargetRtp = modeEntries.some(([, report]) => report.targetRtp !== undefined);
        const metricRows: Array<[string, (report: SimulationReport) => string]> = [
            ["RTP (observed)", (report) => `${(report.rtp * 100).toFixed(2)}%`],
        ];
        if (hasTargetRtp) {
            metricRows.push(
                ["RTP (target)", (report) => (report.targetRtp !== undefined ? `${(report.targetRtp * 100).toFixed(2)}%` : "–")],
                ["RTP deviation", (report) => (report.rtpDeviation !== undefined ? `${(report.rtpDeviation * 100).toFixed(2)} pp` : "–")],
            );
        }
        metricRows.push(
            ["Stake (avg bet)", (report) => (report.averageBet ?? 0).toFixed(2)],
            ["Hit / feature rate", (report) => `${(report.hitFrequency * 100).toFixed(2)}%`],
            ["Average payout", (report) => (report.averagePayout ?? 0).toFixed(2)],
            ["Max win", (report) => report.maxWin.toFixed(2)],
            ["Volatility", (report) => (report.volatility ?? 0).toFixed(2)],
            ["Max win frequency", (report) => `${((report.maxWinFrequency ?? 0) * 100).toFixed(4)}%`],
        );

        const headerRow = `            <tr><th>Metric</th>${modeEntries.map(([modeId]) => `<th>${this.escapeHtml(modeId)}</th>`).join("")}</tr>`;
        const bodyRows = metricRows.map(([label, format]) => {
            const cells = modeEntries.map(([, report]) => `<td>${format(report)}</td>`).join("");
            return `            <tr><th scope="row">${label}</th>${cells}</tr>`;
        });

        return [
            "        <section>",
            "            <h2>Comparison</h2>",
            "            <table>",
            "                <thead>",
            headerRow,
            "                </thead>",
            "                <tbody>",
            ...bodyRows,
            "                </tbody>",
            "            </table>",
            "        </section>",
        ];
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

    private renderJackpotSection(report: SimulationReport): string[] {
        if (!report.jackpot) {
            return [];
        }

        const jackpot = report.jackpot;
        const summary = [
            `Award count: ${jackpot.awardCount}`,
            `Total awarded: ${jackpot.totalAwarded.toFixed(2)}`,
            `Total contributed: ${jackpot.totalContributed.toFixed(2)}`,
            `Contribution to RTP: ${(jackpot.contribution * 100).toFixed(4)} pp`,
        ];

        const headerRow = "            <tr><th>Pool</th><th>Award count</th><th>Total awarded</th><th>Total contributed</th><th>Contribution</th></tr>";
        const rows = Object.entries(jackpot.pools).map(([poolId, pool]) => {
            return (
                `            <tr><td>${this.escapeHtml(poolId)}</td><td>${pool.awardCount}</td><td>${pool.totalAwarded.toFixed(2)}</td>` +
                `<td>${pool.totalContributed.toFixed(2)}</td><td>${(pool.contribution * 100).toFixed(4)} pp</td></tr>`
            );
        });

        return [
            "        <section>",
            "            <h2>Jackpot</h2>",
            "            <ul>",
            ...summary.map((item) => `                <li>${item}</li>`),
            "            </ul>",
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

    private renderConvergenceSection(report: SimulationReport): string[] {
        if (!report.convergence) {
            return [];
        }

        const convergence = report.convergence;
        const items = [
            `Min rounds: ${convergence.minRounds}`,
            `RTP tolerance: ${(convergence.rtpTolerance * 100).toFixed(3)} pp`,
            `Check interval: ${convergence.checkIntervalRounds}`,
            `Stable checks required: ${convergence.stableChecks}`,
            `Checks performed: ${convergence.checksPerformed}`,
            `Consecutive stable checks: ${convergence.consecutiveStableChecks}`,
            `Achieved RTP half-width: ${(convergence.achievedRtpHalfWidth * 100).toFixed(3)} pp`,
        ];

        return [
            "        <section>",
            "            <h2>Convergence</h2>",
            "            <ul>",
            ...items.map((item) => `                <li>${item}</li>`),
            "            </ul>",
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
