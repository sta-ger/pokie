import {describeSimulationDiagnostics, describeSimulationStopReason} from "./describeSimulationDiagnostics.js";
import {describeFeatureAnalytics} from "../simulation/describeFeatureAnalytics.js";
import {payoutHistogramRows} from "./payoutHistogramPresentation.js";
import {describeWeightedBonusCoverage} from "../session/videoslot/authored/WeightedBonus.js";
import {describeSequenceVariantCoverage} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import {describeMathFacingRecommendation} from "./mathFacingSimulationAdvice.js";
import {describeExactReferenceScope} from "./describeExactReferenceScope.js";
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
            "    <style>",
            "        body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0; color: #1f2933; background: #faf9f5; }",
            "        article { max-width: 76rem; margin: 0 auto; padding: 2rem; }",
            "        h1, h2, h3 { letter-spacing: -0.02em; }",
            "        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }",
            "        th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #d5d6cf; vertical-align: top; }",
            "        code { background: #ece9df; padding: 0.1rem 0.25rem; border-radius: 3px; }",
            "        section { margin: 1.5rem 0; }",
            "    </style>",
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
            "    <style>",
            "        body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0; color: #1f2933; background: #faf9f5; }",
            "        article { max-width: 76rem; margin: 0 auto; padding: 2rem; }",
            "        h1, h2, h3 { letter-spacing: -0.02em; }",
            "        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }",
            "        th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #d5d6cf; vertical-align: top; }",
            "        code { background: #ece9df; padding: 0.1rem 0.25rem; border-radius: 3px; }",
            "        section { margin: 1.5rem 0; }",
            "    </style>",
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
            ...(report.betMode !== undefined ? ([["Bet mode", this.escapeHtml(report.betMode)]] as Array<[string, string]>) : []),
            ["Seed", report.seed === null ? "none" : this.escapeHtml(report.seed)],
            ["Requested plays", String(report.requestedRounds)],
            ["Completed paid rounds", String(report.rounds)],
            ...(report.sampling !== undefined ? ([["Accepted plays (paid + free spins)", String(report.sampling.acceptedSubrounds)]] as Array<[string, string]>) : []),
            ...(report.stopReason !== undefined ? ([["Stop reason", this.escapeHtml(describeSimulationStopReason(report.stopReason))]] as Array<[string, string]>) : []),
            ["Total bet", report.totalBet.toFixed(2)],
            ["Total win", report.totalWin.toFixed(2)],
            ...(report.targetRtp !== undefined
                ? ([
                    ["RTP target", `${(report.targetRtp * 100).toFixed(2)}%`],
                    ["RTP deviation", `${((report.rtpDeviation as number) * 100).toFixed(2)} pp`],
                ] as Array<[string, string]>)
                : []),
            ["Duration", `${report.durationMs}ms`],
            ["Spins per second", String(report.spinsPerSecond)],
        ];
        const tableRows = rows.map(([label, value]) => `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("\n");
        const atAGlance = [
            `RTP ${(report.rtp * 100).toFixed(2)}%`,
            ...(report.rtpConfidenceInterval95 !== undefined ? [`(95% CI ${formatPercentInterval(report.rtpConfidenceInterval95)})`] : []),
            `hit frequency ${(report.hitFrequency * 100).toFixed(2)}%`,
            `largest observed win ${report.maxWin.toFixed(2)}× bet`,
            `over ${report.rounds.toLocaleString()} paid rounds`,
        ].join(" ");
        const histogramRows = payoutHistogramRows(report.payoutHistogram);
        const summaryItems = [
            `RTP: ${(report.rtp * 100).toFixed(2)}%${report.rtpConfidenceInterval95 === undefined ? "" : ` (95% CI ${formatPercentInterval(report.rtpConfidenceInterval95)})`}. Empirical estimate, not a proof of the configured RTP.`,
            `Hit frequency: ${(report.hitFrequency * 100).toFixed(2)}% of completed paid rounds produced at least one win.`,
            ...(report.volatility !== undefined ? [`Volatility (std. deviation, bet units): ${report.volatility.toFixed(2)} (standard deviation of payout per paid round, in bet units).`] : []),
            `Largest observed whole-round win: ${report.maxWin.toFixed(2)}× bet${report.maxWinFrequency === undefined ? "" : `; observed in ${(report.maxWinFrequency * 100).toFixed(4)}% of paid rounds`}. This is a sample maximum for a completed paid round, not the theoretical game maximum. The separate single-spin maximum in the technical appendix is a smaller unit.`,
            ...(report.averagePayout !== undefined ? [`Average payout: ${report.averagePayout.toFixed(2)}× bet${report.averagePayoutConfidenceInterval95 === undefined ? "" : ` (95% CI ${formatAmountInterval(report.averagePayoutConfidenceInterval95)})`}.`] : []),
            ...(histogramRows.length > 0 ? [`Payout profile: ${histogramRows.map((row) => `${(row.share * 100).toFixed(2)}% ${row.label}`).join("; ")}.`] : []),
        ];
        const nextSteps = report.recommendations && report.recommendations.length > 0
            ? report.recommendations.map(describeMathFacingRecommendation)
            : [
                "Compare this sample with exact math when the design is small enough to enumerate.",
                "Run more paid rounds if the RTP confidence interval is wider than you need.",
            ];
        const jsonAdvice = "Keep the JSON export with this report if you need to re-analyse it later.";
        if (!nextSteps.includes(jsonAdvice)) nextSteps.push(jsonAdvice);

        return [
            `        <p><strong>At a glance:</strong> ${this.escapeHtml(atAGlance)}. This is an empirical estimate; confidence intervals and unseen rare events still matter.</p>`,
            "        <section>",
            "            <h2>What this means</h2>",
            "            <ul>",
            ...summaryItems.map((item) => `                <li>${this.escapeHtml(item)}</li>`),
            "            </ul>",
            "        </section>",
            ...this.renderExactReferenceSection(report),
            "        <section>",
            "            <h2>Key numbers</h2>",
            "            <table>",
            "                <tbody>",
            tableRows,
            "                </tbody>",
            "            </table>",
            "        </section>",
            ...this.renderPayoutHistogramSection(report),
            ...this.renderListSection("Warnings", report.warnings),
            "        <section>",
            "            <h2>What to check next</h2>",
            "            <ul>",
            ...nextSteps.map((item) => `                <li>${this.escapeHtml(item)}</li>`),
            "            </ul>",
            "        </section>",
            "        <details>",
            "            <summary>Technical appendix (audit details)</summary>",
            "        <section>",
            "            <h2>Technical appendix</h2>",
            "            <h3>Sampling and precision diagnostics</h3>",
            ...describeSimulationDiagnostics(report).map(line => `            <p>${this.escapeHtml(line)}</p>`),
            ...(report.sampling ? [`            <h3>Paid-round sampling</h3><p>Completed paid rounds: ${report.rounds}; spins accepted: ${report.sampling.acceptedSubrounds}; carried spins: ${report.sampling.carriedSubrounds ?? 0}; excluded unfinished/restored spins: ${report.sampling.excludedSubrounds}. Independent session trajectory per worker. Monetary totals include every observed spin.</p>`] : []),
            ...(report.modifiers ? [`            <h3>Screen modifiers</h3><p>Executed steps: ${this.escapeHtml(String(report.modifiers.steps))}; rule applications: ${this.escapeHtml(String(report.modifiers.ruleApplications))}; sticky steps: ${this.escapeHtml(String(report.modifiers.stickySteps))}; multiplied components: ${this.escapeHtml(String(report.modifiers.multipliedComponents))}</p>`] : []),
            ...(report.weightedBonus ? [`            <h3>Weighted bonus ${this.escapeHtml(report.weightedBonus.tableId)}</h3><p>${report.weightedBonus.selections} eligible selections; ${report.weightedBonus.completed} completed; ${report.weightedBonus.incomplete} incomplete net of carried tails</p>`, "<table><tr><th>Outcome ID</th><th>Weight</th><th>Configured probability</th><th>Count</th><th>Actual frequency</th><th>Coverage</th></tr>", ...report.weightedBonus.outcomes.map(o => `<tr><td>${this.escapeHtml(o.id)}</td><td>${o.weight}</td><td>${o.probability}</td><td>${o.count}</td><td>${o.frequency}</td><td>${describeWeightedBonusCoverage(o.weight, o.uncovered)}</td></tr>`), "</table>"] : []),
            ...(report.reelSequences ?? []).flatMap(reel => [`            <h3>Weighted reel ${reel.reelIndex + 1} (${this.escapeHtml(reel.context)}; ${reel.selections} selections)</h3>`, "<table><tr><th>Variant ID</th><th>Weight</th><th>Probability</th><th>Count</th><th>Frequency</th><th>Coverage</th></tr>",
                ...reel.variants.map(variant => `<tr><td>${this.escapeHtml(variant.id)}</td><td>${variant.weight}</td><td>${variant.probability === 0 && variant.weight > 0 ? `${this.escapeHtml(String(variant.probabilityRatio?.numerator))}/${this.escapeHtml(String(variant.probabilityRatio?.denominator))}` : variant.probability}</td><td>${variant.count}</td><td>${variant.frequency}</td><td>${describeSequenceVariantCoverage(variant.weight, variant.uncovered)}</td></tr>`), "</table>"]),
            "            <h3>Feature analytics</h3>",
            ...describeFeatureAnalytics(report.analytics).map(line => `<p>${this.escapeHtml(line)}</p>`),
            ...this.renderBreakdownSection(report),
            ...this.renderJackpotSection(report),
            ...this.renderConvergenceSection(report),
            ...this.renderReproducibilitySection(report),
            "        </section>",
            "        </details>",
        ];
    }

    private renderExactReferenceSection(report: SimulationReport): string[] {
        const exact = report.exactReference;
        if (exact === undefined) return [];
        const interval = report.rtpConfidenceInterval95;
        const exactRtp = exact.rtp;
        const deltaPp = (report.rtp - exactRtp) * 100;
        const intervalLine = interval === undefined
            ? "This report has no RTP confidence interval to compare with the exact value."
            : `The sample's 95% RTP interval is ${formatPercentInterval(interval)}; it ${interval.low <= exactRtp && exactRtp <= interval.high ? "contains" : "does not contain"} the exact RTP.`;
        let scope: string;
        let detail: string;
        let note: string;
        if (exact.freeGamesRtp !== undefined) {
            const freeGames = exact.freeGamesRtp;
            scope = "Exact total RTP (paid + free games)";
            detail = `Exact total RTP: <strong>${(freeGames.totalRtp * 100).toFixed(4)}%</strong> = ${(freeGames.baseRtp * 100).toFixed(4)}% paid-spin + ${(freeGames.featureRtp * 100).toFixed(4)}% free games, from ${exact.outcomes.toLocaleString()} enumerated paid-spin outcomes. The ${report.rounds.toLocaleString()} paid-round sample differs by <strong>${signed(deltaPp)} pp</strong> total RTP.`;
            note = "Exact math covers paid spins plus the additive free-game triggers in this library. Feature payouts outside that model still need Simulation.";
        } else {
            ({scope, note} = describeExactReferenceScope(exact.featurePayoutsIncluded));
            detail = `RTP <strong>${(exact.rtp * 100).toFixed(4)}%</strong>, hit frequency <strong>${(exact.hitFrequency * 100).toFixed(4)}%</strong>, from ${exact.outcomes.toLocaleString()} enumerated outcomes. The ${report.rounds.toLocaleString()} paid-round sample differs by <strong>${signed(deltaPp)} pp</strong> RTP and <strong>${signed((report.hitFrequency - exact.hitFrequency) * 100)} pp</strong> hit frequency.`;
        }
        return [
            "        <section>",
            "            <h2>Exact math reference</h2>",
            `            <p><strong>${scope}:</strong> ${detail}</p>`,
            `            <p>${intervalLine}</p>`,
            `            <p>${note}</p>`,
            "        </section>",
        ];
    }

    private renderPayoutHistogramSection(report: SimulationReport): string[] {
        const rows = payoutHistogramRows(report.payoutHistogram);
        if (rows.length === 0) return [];
        return [
            "        <section>",
            "            <h2>Payout distribution</h2>",
            "            <table>",
            "                <thead><tr><th>Payout bucket (× bet)</th><th>Paid rounds</th><th>Share</th></tr></thead>",
            "                <tbody>",
            ...rows.map(row => `                    <tr><td>${this.escapeHtml(row.label)}</td><td>${row.rounds}</td><td>${(row.share * 100).toFixed(2)}%</td></tr>`),
            "                </tbody>",
            "            </table>",
            "            <div aria-label=\"Payout distribution bars\">",
            ...rows.map(row => `                <div style="display:grid;grid-template-columns:8rem 1fr 4rem;gap:.5rem;align-items:center"><span>${this.escapeHtml(row.label)}</span><progress max="100" value="${(row.share * 100).toFixed(2)}"></progress><span>${(row.share * 100).toFixed(2)}%</span></div>`),
            "            </div>",
            "        </section>",
        ];
    }

    private renderSetSummary(reportSet: SimulationReportSet, modeEntries: Array<[string, SimulationReport]>): string[] {
        const rows: Array<[string, string]> = [
            ["Game id", this.escapeHtml(reportSet.game.id)],
            ["Game version", this.escapeHtml(reportSet.game.version)],
            ["Requested plays", String(reportSet.requestedRounds)],
            ["Seed", reportSet.seed === null ? "none" : this.escapeHtml(reportSet.seed)],
            ["Parallel workers", String(reportSet.workers ?? 1)],
            ["Modes compared", modeEntries.map(([modeId]) => this.escapeHtml(modeId)).join(", ")],
        ];
        const tableRows = rows.map(([label, value]) => `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("\n");

        return ["        <table>", "            <tbody>", tableRows, "            </tbody>", "        </table>",

        ];
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
            ["Largest observed whole-round win", (report) => report.maxWin.toFixed(2)],
            ["Volatility (std. deviation, bet units)", (report) => (report.volatility ?? 0).toFixed(2)],
            ["Largest observed whole-round win frequency", (report) => `${((report.maxWinFrequency ?? 0) * 100).toFixed(4)}%`],
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
            "            <tr><th>Category</th><th>Samples</th><th>Total bet</th><th>Total win</th><th>RTP</th>" +
            "<th>Contribution</th><th>Hit frequency</th><th>Largest observed win in category</th></tr>";
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
            "            <h3>Breakdown</h3>",
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
            "            <h3>Jackpot</h3>",
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
            `Minimum paid rounds per worker: ${convergence.minRounds}`,
            `RTP tolerance: ${(convergence.rtpTolerance * 100).toFixed(3)} pp`,
            `Check interval: ${convergence.checkIntervalRounds}`,
            `Stable checks required: ${convergence.stableChecks}`,
            `Checks performed: ${convergence.checksPerformed}`,
            `Consecutive stable checks: ${convergence.consecutiveStableChecks}`,
            `Achieved RTP half-width: ${convergence.achievedRtpHalfWidth === null ? "unavailable" : (convergence.achievedRtpHalfWidth * 100).toFixed(3)} pp`,
        ];

        return [
            "        <section>",
            "            <h3>Convergence</h3>",
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
            `Requested plays: ${reproducibility.requestedRounds}`,
            `Completed paid rounds: ${reproducibility.actualRounds}`,
            `Re-run command: <code>${this.escapeHtml(reproducibility.command)}</code>`,
        ];
        if (reproducibility.workerSeedStrategy) {
            items.push(`Parallel seed strategy: ${this.escapeHtml(reproducibility.workerSeedStrategy)}`);
        }
        if (reproducibility.configHash !== undefined) {
            items.push(`Resolved model/config hash: <code>${this.escapeHtml(reproducibility.configHash)}</code>`);
        }
        if (reproducibility.pokieVersion !== undefined) {
            items.push(`POKIE/runtime version: ${this.escapeHtml(reproducibility.pokieVersion)}`);
        }

        return [
            "        <section>",
            "            <h3>Reproducibility</h3>",
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

function formatPercentInterval(interval: {low: number; high: number}): string {
    return `${(interval.low * 100).toFixed(2)}% – ${(interval.high * 100).toFixed(2)}%`;
}

function formatAmountInterval(interval: {low: number; high: number}): string {
    return `${interval.low.toFixed(2)} – ${interval.high.toFixed(2)}`;
}

function signed(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
