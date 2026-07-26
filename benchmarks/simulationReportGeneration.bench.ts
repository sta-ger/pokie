import {HtmlSimulationReportRenderer, MarkdownSimulationReportRenderer, PokieGameManifest, SimulationAccumulator, SimulationReportBuilder} from "pokie";
import {formatBenchmarkLine, measureBenchmark} from "./support/measureBenchmark.js";

// A large-ish round count so the resulting payout histogram (one bucket per distinct payout ratio --
// see SimulationAccumulator/PayoutHistogramBucketOrder) has enough distinct buckets to be a
// representative render target, not just a handful of rows.
const ROUNDS = 100_000;
const MANIFEST: PokieGameManifest = {id: "benchmark-game", name: "Benchmark Game", version: "0.1.0"};

function payoutForRound(round: number): number {
    if (round % 97 === 0) {
        return 500;
    }
    return round % 13 === 0 ? 10 : 0;
}

function buildStatistics() {
    const accumulator = new SimulationAccumulator();
    for (let round = 0; round < ROUNDS; round++) {
        accumulator.addRound(1, payoutForRound(round));
    }
    return accumulator.getStatistics();
}

describe("benchmark: simulation report generation (build + render)", () => {
    test(`builds a report from ${ROUNDS} rounds and records timing (no hard threshold)`, () => {
        const statistics = buildStatistics();
        const builder = new SimulationReportBuilder();

        const {result: report, durationMs} = measureBenchmark(() =>
            builder.build({manifest: MANIFEST, requestedRounds: ROUNDS, statistics, durationMs: 1234}),
        );

        console.log(formatBenchmarkLine("simulationReportBuild", {rounds: ROUNDS, durationMs}));
        expect(report.rounds).toBe(ROUNDS);
    });

    test(`renders an HTML and Markdown report for ${ROUNDS} rounds and records timing (no hard threshold)`, () => {
        const statistics = buildStatistics();
        const report = new SimulationReportBuilder().build({manifest: MANIFEST, requestedRounds: ROUNDS, statistics, durationMs: 1234});

        const html = measureBenchmark(() => new HtmlSimulationReportRenderer().render(report));
        const markdown = measureBenchmark(() => new MarkdownSimulationReportRenderer().render(report));

        console.log(formatBenchmarkLine("simulationReportRenderHtml", {rounds: ROUNDS, durationMs: html.durationMs}));
        console.log(formatBenchmarkLine("simulationReportRenderMarkdown", {rounds: ROUNDS, durationMs: markdown.durationMs}));

        expect(html.result.length).toBeGreaterThan(0);
        expect(markdown.result.length).toBeGreaterThan(0);
    });
});
