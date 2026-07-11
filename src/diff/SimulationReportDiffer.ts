import type {SimulationReport} from "../reporting/SimulationReport.js";
import type {SimulationReportBreakdown, SimulationReportBreakdownComponent} from "../reporting/SimulationReportBreakdown.js";
import {SimulationCategoryOrdering} from "../simulation/SimulationCategoryOrdering.js";
import type {SimulationReportBreakdownComponentDiff, SimulationReportBreakdownDiff, SimulationReportDiff, SimulationReportMetricDiff} from "./SimulationReportDiff.js";
import type {SimulationReportDiffing} from "./SimulationReportDiffing.js";

export class SimulationReportDiffer implements SimulationReportDiffing {
    public static readonly DEFAULT_RTP_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD: number = 0.01;
    public static readonly DEFAULT_MAX_WIN_PERCENT_DELTA_WARNING_THRESHOLD: number = 10;

    private readonly rtpDeltaWarningThreshold: number;
    private readonly hitFrequencyDeltaWarningThreshold: number;
    private readonly maxWinPercentDeltaWarningThreshold: number;

    constructor(
        rtpDeltaWarningThreshold: number = SimulationReportDiffer.DEFAULT_RTP_DELTA_WARNING_THRESHOLD,
        hitFrequencyDeltaWarningThreshold: number = SimulationReportDiffer.DEFAULT_HIT_FREQUENCY_DELTA_WARNING_THRESHOLD,
        maxWinPercentDeltaWarningThreshold: number = SimulationReportDiffer.DEFAULT_MAX_WIN_PERCENT_DELTA_WARNING_THRESHOLD,
    ) {
        this.rtpDeltaWarningThreshold = rtpDeltaWarningThreshold;
        this.hitFrequencyDeltaWarningThreshold = hitFrequencyDeltaWarningThreshold;
        this.maxWinPercentDeltaWarningThreshold = maxWinPercentDeltaWarningThreshold;
    }

    public diff(left: SimulationReport, right: SimulationReport): SimulationReportDiff {
        const rtp = this.metricDiff(left.rtp, right.rtp);
        const hitFrequency = this.metricDiff(left.hitFrequency, right.hitFrequency);
        const maxWin = this.metricDiff(left.maxWin, right.maxWin);
        const breakdown = this.diffBreakdown(left.breakdown, right.breakdown);

        return {
            game: {
                left: {...left.game},
                right: {...right.game},
                changed: left.game.id !== right.game.id || left.game.name !== right.game.name || left.game.version !== right.game.version,
            },
            seed: {
                left: left.seed,
                right: right.seed,
                changed: left.seed !== right.seed,
            },
            requestedRounds: this.metricDiff(left.requestedRounds, right.requestedRounds),
            rounds: this.metricDiff(left.rounds, right.rounds),
            totalBet: this.metricDiff(left.totalBet, right.totalBet),
            totalWin: this.metricDiff(left.totalWin, right.totalWin),
            rtp,
            hitFrequency,
            maxWin,
            durationMs: this.metricDiff(left.durationMs, right.durationMs),
            spinsPerSecond: this.metricDiff(left.spinsPerSecond, right.spinsPerSecond),
            warnings: this.buildWarnings(rtp, hitFrequency, maxWin, breakdown, left.breakdown, right.breakdown),
            breakdown,
        };
    }

    private metricDiff(left: number, right: number): SimulationReportMetricDiff {
        const delta = right - left;
        const percentDelta = left !== 0 ? (delta / Math.abs(left)) * 100 : null;
        return {left, right, delta, percentDelta};
    }

    private buildWarnings(
        rtp: SimulationReportMetricDiff,
        hitFrequency: SimulationReportMetricDiff,
        maxWin: SimulationReportMetricDiff,
        breakdown: SimulationReportBreakdownDiff | undefined,
        leftBreakdown: SimulationReportBreakdown | undefined,
        rightBreakdown: SimulationReportBreakdown | undefined,
    ): string[] {
        const warnings: string[] = [];

        if (Math.abs(rtp.delta) >= this.rtpDeltaWarningThreshold) {
            warnings.push(
                `RTP changed by ${this.formatSigned(rtp.delta * 100, 2)} percentage points ` +
                    `(${(rtp.left * 100).toFixed(2)}% -> ${(rtp.right * 100).toFixed(2)}%)`,
            );
        }

        if (Math.abs(hitFrequency.delta) >= this.hitFrequencyDeltaWarningThreshold) {
            warnings.push(
                `Hit frequency changed by ${this.formatSigned(hitFrequency.delta * 100, 2)} percentage points ` +
                    `(${(hitFrequency.left * 100).toFixed(2)}% -> ${(hitFrequency.right * 100).toFixed(2)}%)`,
            );
        }

        if (maxWin.left === 0 && maxWin.right !== 0) {
            warnings.push(`Max win went from 0 to ${maxWin.right.toFixed(2)}`);
        } else if (maxWin.percentDelta !== null && Math.abs(maxWin.percentDelta) >= this.maxWinPercentDeltaWarningThreshold) {
            warnings.push(`Max win changed by ${this.formatSigned(maxWin.percentDelta, 2)}% (${maxWin.left.toFixed(2)} -> ${maxWin.right.toFixed(2)})`);
        }

        if (breakdown) {
            Object.entries(breakdown.components).forEach(([category, componentDiff]) => {
                warnings.push(...this.buildBreakdownComponentWarnings(category, componentDiff));
            });
        } else {
            const availabilityNote = this.buildBreakdownAvailabilityNote(leftBreakdown, rightBreakdown);
            if (availabilityNote) {
                warnings.push(availabilityNote);
            }
        }

        return warnings;
    }

    // A category present on only one side isn't a "changed" category, it's an added or removed one —
    // reporting that as e.g. "RTP changed by -100 percentage points" would read as the category's math
    // getting worse, when really it just stopped being categorized (or is new). Framing those two cases
    // explicitly avoids that, and — unlike the RTP-delta-threshold warning below — always fires: a
    // category structurally appearing/disappearing is worth knowing about regardless of magnitude.
    private buildBreakdownComponentWarnings(category: string, componentDiff: SimulationReportBreakdownComponentDiff): string[] {
        if (componentDiff.left === null) {
            return [
                `"${category}" is a new category in the right report (rtp ${(componentDiff.rtp.right * 100).toFixed(2)}%, ` +
                    `contributing ${(componentDiff.contribution.right * 100).toFixed(2)} pp)`,
            ];
        }
        if (componentDiff.right === null) {
            return [
                `"${category}" is no longer present in the right report (was rtp ${(componentDiff.rtp.left * 100).toFixed(2)}%, ` +
                    `contributing ${(componentDiff.contribution.left * 100).toFixed(2)} pp)`,
            ];
        }
        if (Math.abs(componentDiff.rtp.delta) >= this.rtpDeltaWarningThreshold) {
            return [
                `"${category}" RTP changed by ${this.formatSigned(componentDiff.rtp.delta * 100, 2)} percentage points ` +
                    `(${(componentDiff.rtp.left * 100).toFixed(2)}% -> ${(componentDiff.rtp.right * 100).toFixed(2)}%)`,
            ];
        }
        return [];
    }

    // Diffing a category-by-category breakdown only makes sense when BOTH reports have one. Two old
    // reports (or two reports from a game that doesn't categorize rounds) is the common case and isn't
    // worth mentioning — but exactly one side having a breakdown is more likely a mismatch the caller
    // didn't intend (e.g. diffing a report from before this game added free games against one from
    // after), so that specific case gets a warning explaining why "Breakdown:" is missing.
    private buildBreakdownAvailabilityNote(left: SimulationReportBreakdown | undefined, right: SimulationReportBreakdown | undefined): string | undefined {
        if (!!left === !!right) {
            return undefined;
        }
        const sideWithout = left ? "right" : "left";
        return `Feature-level breakdown comparison skipped — the ${sideWithout} report has no breakdown data.`;
    }

    private diffBreakdown(left: SimulationReportBreakdown | undefined, right: SimulationReportBreakdown | undefined): SimulationReportBreakdownDiff | undefined {
        if (!left || !right) {
            return undefined;
        }

        // Sorted ("base" first, then alphabetically) so the category order is the same every diff,
        // regardless of which side introduced a category first or what order simulation encountered it in.
        const categories = SimulationCategoryOrdering.sort([...new Set([...Object.keys(left.components), ...Object.keys(right.components)])]);
        const components: Record<string, SimulationReportBreakdownComponentDiff> = {};
        categories.forEach((category) => {
            components[category] = this.diffBreakdownComponent(left.components[category], right.components[category]);
        });

        return {components};
    }

    private diffBreakdownComponent(
        left: SimulationReportBreakdownComponent | undefined,
        right: SimulationReportBreakdownComponent | undefined,
    ): SimulationReportBreakdownComponentDiff {
        return {
            left: left ?? null,
            right: right ?? null,
            rounds: this.metricDiff(left?.rounds ?? 0, right?.rounds ?? 0),
            totalBet: this.metricDiff(left?.totalBet ?? 0, right?.totalBet ?? 0),
            totalWin: this.metricDiff(left?.totalWin ?? 0, right?.totalWin ?? 0),
            rtp: this.metricDiff(left?.rtp ?? 0, right?.rtp ?? 0),
            contribution: this.metricDiff(left?.contribution ?? 0, right?.contribution ?? 0),
            hitFrequency: this.metricDiff(left?.hitFrequency ?? 0, right?.hitFrequency ?? 0),
            maxWin: this.metricDiff(left?.maxWin ?? 0, right?.maxWin ?? 0),
        };
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }
}
