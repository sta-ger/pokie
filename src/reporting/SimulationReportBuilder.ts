import type {SimulationReport, SimulationReportReproducibility} from "./SimulationReport.js";
import type {SimulationReportBuilding} from "./SimulationReportBuilding.js";
import type {SimulationReportInput} from "./SimulationReportInput.js";

type CoreMetrics = Omit<SimulationReport, "reproducibility" | "warnings" | "recommendations">;

export class SimulationReportBuilder implements SimulationReportBuilding {
    public static readonly LOW_ROUNDS_WARNING_THRESHOLD: number = 10000;

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

        const warnings = this.buildWarnings(core);

        return {
            ...core,
            reproducibility: this.buildReproducibility(core, packageRoot),
            warnings,
            recommendations: this.buildRecommendations(core),
        };
    }

    private buildReproducibility(core: CoreMetrics, packageRoot: string | undefined): SimulationReportReproducibility {
        const target = packageRoot ?? "<packageRoot>";
        const seedFlag = core.seed !== null ? ` --seed ${core.seed}` : "";

        return {
            game: core.game,
            seed: core.seed,
            requestedRounds: core.requestedRounds,
            actualRounds: core.rounds,
            command: `pokie sim ${target} --rounds ${core.requestedRounds}${seedFlag}`,
        };
    }

    private buildWarnings(core: CoreMetrics): string[] {
        const warnings: string[] = [];

        if (core.seed === null) {
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

        return warnings;
    }

    private buildRecommendations(core: CoreMetrics): string[] {
        const recommendations: string[] = [];

        if (core.seed === null) {
            recommendations.push("Run with --seed <value> to make this simulation reproducible.");
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
}
