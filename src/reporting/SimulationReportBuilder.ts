import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";
import type {SimulationReport, SimulationReportReproducibility} from "./SimulationReport.js";
import type {SimulationReportBreakdown} from "./SimulationReportBreakdown.js";
import type {SimulationReportBuilding} from "./SimulationReportBuilding.js";
import type {SimulationReportInput} from "./SimulationReportInput.js";

type CoreMetrics = Omit<SimulationReport, "reproducibility" | "warnings" | "recommendations" | "breakdown">;

export class SimulationReportBuilder implements SimulationReportBuilding {
    public static readonly LOW_ROUNDS_WARNING_THRESHOLD: number = 10000;
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

        const breakdown = this.buildBreakdown(input.breakdown);
        const warnings = this.buildWarnings(core, breakdown);

        return {
            ...core,
            breakdown,
            reproducibility: this.buildReproducibility(core, packageRoot),
            warnings,
            recommendations: this.buildRecommendations(core, breakdown),
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

        if (breakdown && this.hasSuspiciouslyZeroFeatureContribution(breakdown)) {
            warnings.push(
                "Feature-level breakdown is available, but no non-base category (e.g. free games) contributed " +
                    "any win in this run — this may mean the feature never triggered, or its win is being " +
                    "misattributed to the base category.",
            );
        }

        return warnings;
    }

    private buildRecommendations(core: CoreMetrics, breakdown: SimulationReportBreakdown | undefined): string[] {
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

        if (!breakdown) {
            recommendations.push(
                "No feature-level RTP breakdown is available for this game — implement the optional " +
                    "StakeAmountDetermining contract (or inject a custom SimulationRoundCategoryDetermining) on the " +
                    "session to get a base vs. free-games breakdown.",
            );
        }

        return recommendations;
    }

    private buildBreakdown(components: Record<string, SimulationBreakdownComponent> | undefined): SimulationReportBreakdown | undefined {
        if (!components || Object.keys(components).length === 0) {
            return undefined;
        }
        return {components};
    }

    private hasSuspiciouslyZeroFeatureContribution(breakdown: SimulationReportBreakdown): boolean {
        const featureCategories = Object.keys(breakdown.components).filter((category) => category !== SimulationReportBuilder.BASE_CATEGORY);
        if (featureCategories.length === 0) {
            return true;
        }
        const featureTotalWin = featureCategories.reduce((sum, category) => sum + breakdown.components[category].totalWin, 0);
        return featureTotalWin === 0;
    }
}
