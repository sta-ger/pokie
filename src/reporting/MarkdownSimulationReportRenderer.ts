import {describeSimulationDiagnostics, describeSimulationStopReason} from "./describeSimulationDiagnostics.js";
import {describeFeatureAnalytics} from "../simulation/describeFeatureAnalytics.js";
import {payoutHistogramBar, payoutHistogramRows} from "./payoutHistogramPresentation.js";
import {describeWeightedBonusCoverage} from "../session/videoslot/authored/WeightedBonus.js";
import {describeSequenceVariantCoverage} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import {describeMathFacingRecommendation} from "./mathFacingSimulationAdvice.js";
import {describeExactReferenceScope} from "./describeExactReferenceScope.js";
import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportRendering} from "./SimulationReportRendering.js";
import type {SimulationReportSet} from "./SimulationReportSet.js";

export class MarkdownSimulationReportRenderer implements SimulationReportRendering {
    public render(report: SimulationReport): string {
        const atAGlance = [
            `RTP ${(report.rtp * 100).toFixed(2)}%`,
            ...(report.rtpConfidenceInterval95 !== undefined ? [`(95% CI ${formatPercentInterval(report.rtpConfidenceInterval95)})`] : []),
            `hit frequency ${(report.hitFrequency * 100).toFixed(2)}%`,
            `largest observed win ${report.maxWin.toFixed(2)}× bet`,
            `over ${report.rounds.toLocaleString()} paid rounds`,
        ].join(" ");
        const histogramRows = payoutHistogramRows(report.payoutHistogram);
        const nextSteps = report.recommendations && report.recommendations.length > 0
            ? report.recommendations.map(describeMathFacingRecommendation)
            : [
                "Compare this sample with exact math when the design is small enough to enumerate.",
                "Run more paid rounds if the RTP confidence interval is wider than you need.",
            ];
        const jsonAdvice = "Keep the JSON export with this report if you need to re-analyse it later.";
        if (!nextSteps.includes(jsonAdvice)) nextSteps.push(jsonAdvice);
        const lines = [
            `# Simulation Report: ${report.game.name}`,
            "",
            `> **At a glance:** ${atAGlance}. This is an empirical estimate; confidence intervals and unseen rare events still matter.`,
            "",
            "## What this means",
            "",
            `- **RTP**: ${(report.rtp * 100).toFixed(2)}%${report.rtpConfidenceInterval95 === undefined ? "" : ` (95% CI ${formatPercentInterval(report.rtpConfidenceInterval95)})`}. Empirical estimate, not a proof of the configured RTP.`,
            `- **Hit frequency**: ${(report.hitFrequency * 100).toFixed(2)}% of completed paid rounds produced at least one win.`,
            ...(report.volatility !== undefined ? [`- **Volatility (std. deviation, bet units)**: ${report.volatility.toFixed(2)} (standard deviation of payout per paid round, in bet units).`] : []),
            `- **Largest observed whole-round win**: ${report.maxWin.toFixed(2)}× bet${report.maxWinFrequency === undefined ? "" : `; observed in ${(report.maxWinFrequency * 100).toFixed(4)}% of paid rounds`}. This is a sample maximum for a completed paid round, not the theoretical game maximum. The separate single-spin maximum in the technical appendix is a smaller unit.`,
            ...(report.averagePayout !== undefined ? [`- **Average payout**: ${report.averagePayout.toFixed(2)}× bet${report.averagePayoutConfidenceInterval95 === undefined ? "" : ` (95% CI ${formatAmountInterval(report.averagePayoutConfidenceInterval95)})`}.`] : []),
            ...(histogramRows.length > 0
                ? [`- **Payout profile**: ${histogramRows.map((row) => `${(row.share * 100).toFixed(2)}% ${row.label}`).join("; ")}.`]
                : []),
            "",
            ...this.renderExactReference(report),
            "## Key numbers",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            `| Game id | \`${report.game.id}\` |`,
            `| Game version | ${report.game.version} |`,
            ...(report.betMode !== undefined ? [`| Bet mode | ${report.betMode} |`] : []),
            `| Seed | ${report.seed ?? "_none_"} |`,
            `| Requested plays | ${report.requestedRounds} |`,
            `| Completed paid rounds | ${report.rounds} |`,
            ...(report.sampling !== undefined ? [`| Accepted plays (paid + free spins) | ${report.sampling.acceptedSubrounds} |`] : []),
            ...(report.stopReason !== undefined ? [`| Stop reason | ${describeSimulationStopReason(report.stopReason)} |`] : []),
            `| Total bet | ${report.totalBet.toFixed(2)} |`,
            `| Total win | ${report.totalWin.toFixed(2)} |`,
            ...(report.targetRtp !== undefined
                ? [
                    `| RTP target | ${(report.targetRtp * 100).toFixed(2)}% |`,
                    `| RTP deviation | ${((report.rtpDeviation as number) * 100).toFixed(2)} pp |`,
                ]
                : []),
            `| Duration | ${report.durationMs}ms |`,
            `| Spins per second | ${report.spinsPerSecond} |`,
        ];

        if (histogramRows.length > 0) {
            lines.push("", "## Payout distribution", "", "| Payout bucket (× bet) | Paid rounds | Share |", "| --- | --- | --- |");
            for (const row of histogramRows) {
                lines.push(`| ${row.label.replace(/[|\n\r]/g, " ")} | ${row.rounds} | ${(row.share * 100).toFixed(2)}% |`);
            }
            lines.push("", "```text");
            for (const row of histogramRows) {
                lines.push(`${row.label.padEnd(14)} ${payoutHistogramBar(row.share)} ${(row.share * 100).toFixed(2)}%`);
            }
            lines.push("```");
        }

        if (report.warnings && report.warnings.length > 0) {
            lines.push("", "## Warnings", "", ...report.warnings.map((warning) => `- ${warning}`));
        }

        lines.push(
            "",
            "## What to check next",
            "",
            ...nextSteps.map((item) => `- ${item}`),
            "",
            "## Technical appendix (audit details)",
            "",
            "### Sampling and precision diagnostics",
            "",
            ...describeSimulationDiagnostics(report).map(line => `- ${line.replace(/[<>|\n\r]/g, " ")}`),
            "",
            "### Feature analytics",
            "",
            ...describeFeatureAnalytics(report.analytics).map(line => `- ${line.replace(/[<>|\n\r]/g, " ")}`),
        );
        if (report.sampling) lines.push("", "### Paid-round sampling", `Completed paid rounds: ${report.rounds}; spins accepted: ${report.sampling.acceptedSubrounds}; carried spins: ${report.sampling.carriedSubrounds ?? 0}; excluded unfinished/restored spins: ${report.sampling.excludedSubrounds}. Independent session trajectory per worker. Monetary totals include every observed spin.`);
        if (report.modifiers) lines.push("", "### Screen modifiers", `Executed steps: ${report.modifiers.steps}; rule applications: ${report.modifiers.ruleApplications}; sticky steps: ${report.modifiers.stickySteps}; multiplied components: ${report.modifiers.multipliedComponents}`);
        if (report.weightedBonus) {
            const bonus = report.weightedBonus;
            lines.push("", `### Weighted bonus ${bonus.tableId} (${bonus.selections} eligible selections; ${bonus.completed} completed; ${bonus.incomplete} incomplete net of carried tails)`, "", "| Outcome ID | Weight | Configured probability | Count | Actual frequency | Coverage |", "| --- | --- | --- | --- | --- | --- |");
            for (const outcome of bonus.outcomes) lines.push(`| ${outcome.id} | ${outcome.weight} | ${outcome.probability} | ${outcome.count} | ${outcome.frequency} | ${describeWeightedBonusCoverage(outcome.weight, outcome.uncovered)} |`);
        }
        for (const reel of report.reelSequences ?? []) {
            lines.push("", `### Weighted reel ${reel.reelIndex + 1} (${reel.context}; ${reel.selections} selections)`, "", "| Variant ID | Weight | Probability | Count | Frequency | Coverage |", "| --- | --- | --- | --- | --- | --- |");
            for (const variant of reel.variants) lines.push(`| ${variant.id.replace(/[|\n\r]/g, " ")} | ${variant.weight} | ${variant.probability === 0 && variant.weight > 0 ? `${variant.probabilityRatio?.numerator}/${variant.probabilityRatio?.denominator}` : variant.probability} | ${variant.count} | ${variant.frequency} | ${describeSequenceVariantCoverage(variant.weight, variant.uncovered)} |`);
        }
        if (report.breakdown) {
            lines.push(
                "",
                "### Breakdown",
                "",
                "| Category | Samples | Total bet | Total win | RTP | Contribution | Hit frequency | Largest observed win in category |",
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

        if (report.jackpot) {
            lines.push(
                "",
                "### Jackpot",
                "",
                `- **Award count**: ${report.jackpot.awardCount}`,
                `- **Total awarded**: ${report.jackpot.totalAwarded.toFixed(2)}`,
                `- **Total contributed**: ${report.jackpot.totalContributed.toFixed(2)}`,
                `- **Contribution to RTP**: ${(report.jackpot.contribution * 100).toFixed(4)} pp`,
                "",
                "| Pool | Award count | Total awarded | Total contributed | Contribution |",
                "| --- | --- | --- | --- | --- |",
            );
            Object.entries(report.jackpot.pools).forEach(([poolId, pool]) => {
                lines.push(
                    `| ${poolId} | ${pool.awardCount} | ${pool.totalAwarded.toFixed(2)} | ${pool.totalContributed.toFixed(2)} | ` +
                        `${(pool.contribution * 100).toFixed(4)} pp |`,
                );
            });
        }

        if (report.convergence) {
            const convergence = report.convergence;
            lines.push(
                "",
                "### Convergence",
                "",
                `- **Minimum paid rounds per worker**: ${convergence.minRounds}`,
                `- **RTP tolerance**: ${(convergence.rtpTolerance * 100).toFixed(3)} pp`,
                `- **Check interval**: ${convergence.checkIntervalRounds}`,
                `- **Stable checks required**: ${convergence.stableChecks}`,
                `- **Checks performed**: ${convergence.checksPerformed}`,
                `- **Consecutive stable checks**: ${convergence.consecutiveStableChecks}`,
                `- **Achieved RTP half-width**: ${convergence.achievedRtpHalfWidth === null ? "unavailable" : (convergence.achievedRtpHalfWidth * 100).toFixed(3)} pp`,
            );
        }

        if (report.reproducibility) {
            const reproducibility = report.reproducibility;
            lines.push(
                "",
                "### Reproducibility",
                "",
                `- **Game**: ${reproducibility.game.name} (\`${reproducibility.game.id}\`, v${reproducibility.game.version})`,
                `- **Seed**: ${reproducibility.seed ?? "_none_"}`,
                `- **Requested plays**: ${reproducibility.requestedRounds}`,
                `- **Completed paid rounds**: ${reproducibility.actualRounds}`,
                `- **Re-run command**: \`${reproducibility.command}\``,
                `- **Parallel workers**: ${report.workers ?? 1}`,
            );
            if (reproducibility.workerSeedStrategy) {
                lines.push(`- **Parallel seed strategy**: ${reproducibility.workerSeedStrategy}`);
            }
            if (reproducibility.configHash !== undefined) {
                lines.push(`- **Resolved model/config hash**: \`${reproducibility.configHash}\``);
            }
            if (reproducibility.pokieVersion !== undefined) {
                lines.push(`- **POKIE/runtime version**: ${reproducibility.pokieVersion}`);
            }
        }

        return lines.join("\n") + "\n";
    }

    private renderExactReference(report: SimulationReport): string[] {
        const exact = report.exactReference;
        if (exact === undefined) return [];
        const interval = report.rtpConfidenceInterval95;
        const exactRtp = exact.rtp;
        const deltaPp = (report.rtp - exactRtp) * 100;
        const intervalLine = interval === undefined
            ? "This report has no RTP confidence interval to compare with the exact value."
            : `The sample's 95% RTP interval is ${formatPercentInterval(interval)}; it ${interval.low <= exactRtp && exactRtp <= interval.high ? "contains" : "does not contain"} the exact RTP.`;
        if (exact.freeGamesRtp !== undefined) {
            const freeGames = exact.freeGamesRtp;
            return [
                "## Exact math reference",
                "",
                `- **Exact total RTP**: ${(freeGames.totalRtp * 100).toFixed(4)}% = ${(freeGames.baseRtp * 100).toFixed(4)}% paid-spin + ${(freeGames.featureRtp * 100).toFixed(4)}% free games, from ${exact.outcomes.toLocaleString()} enumerated paid-spin outcomes. The ${report.rounds.toLocaleString()} paid-round sample differs by **${signed(deltaPp)} pp** total RTP.`,
                `- ${intervalLine}`,
                "- Exact math covers paid spins plus the additive free-game triggers in this library. Feature payouts outside that model still need Simulation.",
                "",
            ];
        }
        const {scope, note: scopeNote} = describeExactReferenceScope(exact.featurePayoutsIncluded);
        return [
            "## Exact math reference",
            "",
            `- **${scope}**: RTP **${(exact.rtp * 100).toFixed(4)}%**, hit frequency **${(exact.hitFrequency * 100).toFixed(4)}%**, from ${exact.outcomes.toLocaleString()} enumerated outcomes. The ${report.rounds.toLocaleString()} paid-round sample differs by **${signed(deltaPp)} pp** RTP and **${signed((report.hitFrequency - exact.hitFrequency) * 100)} pp** hit frequency.`,
            `- ${intervalLine}`,
            `- ${scopeNote}`,
            "",
        ];
    }

    // Side-by-side headline metrics across every mode in the set, followed by each mode's own full
    // section (its complete render() output, demoted one heading level so it nests under "## Mode: id"
    // rather than colliding with it) -- no metric here is computed freshly, every value is read
    // straight off each mode's own already-built SimulationReport. Deliberately no "overall"/blended
    // column -- see SimulationReportSet's own doc comment on why.
    // eslint-disable-next-line @typescript-eslint/member-ordering -- public report-set entry stays beside the single-report renderer it wraps
    public renderSet(reportSet: SimulationReportSet): string {
        const modeEntries = Object.entries(reportSet.modes);
        const hasTargetRtp = modeEntries.some(([, report]) => report.targetRtp !== undefined);

        const lines = [
            `# Simulation Report Set: ${reportSet.game.name}`,
            "",
            `- **Game id**: \`${reportSet.game.id}\``,
            `- **Game version**: ${reportSet.game.version}`,
            `- **Requested plays**: ${reportSet.requestedRounds}`,
            `- **Seed**: ${reportSet.seed ?? "_none_"}`,
            `- **Parallel workers**: ${reportSet.workers ?? 1}`,
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
            this.comparisonRow("Largest observed whole-round win", modeEntries, (report) => report.maxWin.toFixed(2)),
            this.comparisonRow("Volatility (std. deviation, bet units)", modeEntries, (report) => (report.volatility ?? 0).toFixed(2)),
            this.comparisonRow("Largest observed whole-round win frequency", modeEntries, (report) => `${((report.maxWinFrequency ?? 0) * 100).toFixed(4)}%`),
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

function formatPercentInterval(interval: {low: number; high: number}): string {
    return `${(interval.low * 100).toFixed(2)}% – ${(interval.high * 100).toFixed(2)}%`;
}

function formatAmountInterval(interval: {low: number; high: number}): string {
    return `${interval.low.toFixed(2)} – ${interval.high.toFixed(2)}`;
}

function signed(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
