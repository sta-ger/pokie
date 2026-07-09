import type {SimulationReport} from "../reporting/SimulationReport.js";
import type {SimulationReportDiff, SimulationReportMetricDiff} from "./SimulationReportDiff.js";
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
            warnings: this.buildWarnings(rtp, hitFrequency, maxWin),
        };
    }

    private metricDiff(left: number, right: number): SimulationReportMetricDiff {
        const delta = right - left;
        const percentDelta = left !== 0 ? (delta / Math.abs(left)) * 100 : null;
        return {left, right, delta, percentDelta};
    }

    private buildWarnings(rtp: SimulationReportMetricDiff, hitFrequency: SimulationReportMetricDiff, maxWin: SimulationReportMetricDiff): string[] {
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

        return warnings;
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }
}
