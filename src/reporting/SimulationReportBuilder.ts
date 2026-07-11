import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";
import type {SimulationReport, SimulationReportReproducibility} from "./SimulationReport.js";
import type {SimulationReportBreakdown, SimulationReportBreakdownComponent} from "./SimulationReportBreakdown.js";
import type {SimulationReportBuilding} from "./SimulationReportBuilding.js";
import type {SimulationReportInput} from "./SimulationReportInput.js";

type CoreMetrics = Omit<SimulationReport, "reproducibility" | "warnings" | "recommendations" | "breakdown">;

export class SimulationReportBuilder implements SimulationReportBuilding {
    public static readonly LOW_ROUNDS_WARNING_THRESHOLD: number = 10000;
    // A non-base category that appeared with fewer rounds than this never triggers the "zero win"
    // warning below, even if every one of those rounds happened to lose — an all-zero streak that
    // short is common variance, not a signal. At 20 rounds, even a generously high 30% per-round hit
    // rate for the category still has only a ~0.08% chance of losing every single time (0.7^20), so a
    // warning past this threshold is unlikely to be a false positive for any game with an intentional
    // feature.
    public static readonly MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING: number = 20;
    private static readonly BASE_CATEGORY = "base";

    public build(input: SimulationReportInput): SimulationReport {
        const {manifest, requestedRounds, seed, statistics, durationMs, packageRoot} = input;
        const spinsPerSecond = Math.round(statistics.rounds / (Math.max(durationMs, 1) / 1000));

        const core: CoreMetrics = {
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            requestedRounds,
            rounds: statistics.rounds,
            seed: seed ?? null,
            totalBet: statistics.totalBet,
            totalWin: statistics.totalPayout,
            rtp: statistics.rtp,
            hitFrequency: statistics.rounds > 0 ? statistics.hitCount / statistics.rounds : 0,
            maxWin: statistics.maxWin,
            durationMs,
            spinsPerSecond,
        };

        const breakdown = this.buildBreakdown(input.breakdown, core.totalBet);
        const warnings = this.buildWarnings(core, breakdown);

        return {
            ...core,
            breakdown,
            reproducibility: this.buildReproducibility(core, packageRoot),
            warnings,
            recommendations: this.buildRecommendations(core),
        };
    }

    private hasSeed(core: CoreMetrics): boolean {
        return core.seed !== null && core.seed.trim().length > 0;
    }

    private buildReproducibility(core: CoreMetrics, packageRoot: string | undefined): SimulationReportReproducibility {
        const target = packageRoot && packageRoot.trim().length > 0 ? packageRoot : "<packageRoot>";
        const parts = ["pokie", "sim", target, "--rounds", String(core.requestedRounds)];
        if (this.hasSeed(core)) {
            parts.push("--seed", core.seed as string);
        }

        return {
            game: core.game,
            seed: core.seed,
            requestedRounds: core.requestedRounds,
            actualRounds: core.rounds,
            command: parts.join(" "),
        };
    }

    private buildWarnings(core: CoreMetrics, breakdown: SimulationReportBreakdown | undefined): string[] {
        const warnings: string[] = [];

        if (!this.hasSeed(core)) {
            warnings.push("No seed was provided — this run is not reproducible.");
        }

        if (core.requestedRounds < SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD) {
            warnings.push(
                `Requested rounds (${core.requestedRounds}) is low — RTP/hit-frequency estimates may be noisy.`,
            );
        }

        if (core.hitFrequency === 0) {
            warnings.push("Hit frequency is 0 — no round produced a win.");
        }

        if (core.maxWin === 0) {
            warnings.push("Max win is 0 — no round produced a payout.");
        }

        if (core.totalBet === 0) {
            warnings.push("Total bet is 0 — no rounds appear to have been played.");
        }

        if (core.rounds < core.requestedRounds) {
            warnings.push(
                `Actual rounds (${core.rounds}) is less than requested rounds (${core.requestedRounds}) — ` +
                    "the game stopped early (canPlayNextGame() returning false).",
            );
        }

        if (breakdown) {
            warnings.push(...this.buildBreakdownWarnings(core, breakdown));
        }

        return warnings;
    }

    // No warning/recommendation is ever raised for the *absence* of a breakdown itself — most games
    // simply don't have a free-games feature, and that's not a problem worth flagging on every single
    // report forever (see docs/cli.md). Only a breakdown that IS present but looks off gets flagged,
    // and only when the sample size makes that a safe call (see MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING).
    private buildBreakdownWarnings(core: CoreMetrics, breakdown: SimulationReportBreakdown): string[] {
        const warnings: string[] = [];
        const featureCategories = Object.keys(breakdown.components).filter((category) => category !== SimulationReportBuilder.BASE_CATEGORY);

        if (featureCategories.length === 0) {
            if (core.rounds >= SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD) {
                warnings.push(
                    `Feature-level breakdown is available, but no non-base category (e.g. "freeGames") ever appeared ` +
                        `in ${core.rounds} rounds — the feature may not be triggering.`,
                );
            }
            return warnings;
        }

        featureCategories.forEach((category) => {
            const component = breakdown.components[category];
            if (component.rounds >= SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING && component.totalWin === 0) {
                warnings.push(
                    `"${category}" triggered ${component.rounds} times but never produced a win — check whether its ` +
                        `win is being misattributed to the base category.`,
                );
            }
        });

        return warnings;
    }

    private buildRecommendations(core: CoreMetrics): string[] {
        const recommendations: string[] = [];

        if (!this.hasSeed(core)) {
            recommendations.push("Run with --seed <seed> (e.g. --seed demo) to make this simulation reproducible.");
        }

        if (core.requestedRounds < SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD) {
            recommendations.push(
                `Increase --rounds (e.g. ${SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD}+) for more stable RTP/hit-frequency estimates.`,
            );
        }

        recommendations.push('Use "pokie diff" to compare this report against a previous run after changing the game\'s math.');
        recommendations.push("Save this report as JSON via --out to keep a record you can diff or replay against later.");

        return recommendations;
    }

    private buildBreakdown(
        components: Record<string, SimulationBreakdownComponent> | undefined,
        overallTotalBet: number,
    ): SimulationReportBreakdown | undefined {
        if (!components || Object.keys(components).length === 0) {
            return undefined;
        }

        const withContribution: Record<string, SimulationReportBreakdownComponent> = {};
        Object.entries(components).forEach(([category, component]) => {
            withContribution[category] = {
                ...component,
                contribution: overallTotalBet > 0 ? component.totalWin / overallTotalBet : 0,
            };
        });

        return {components: withContribution};
    }
}
