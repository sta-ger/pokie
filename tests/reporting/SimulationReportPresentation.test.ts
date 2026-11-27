import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {emptyFeatureAnalytics, featureAnalyticsStatistics} from "../../src/simulation/FeatureAnalytics.js";
import {describeFeatureAnalytics} from "../../src/simulation/describeFeatureAnalytics.js";
import {HtmlSimulationReportRenderer} from "../../src/reporting/HtmlSimulationReportRenderer.js";
import {MarkdownSimulationReportRenderer} from "../../src/reporting/MarkdownSimulationReportRenderer.js";
import {describeSimulationDiagnostics} from "../../src/reporting/describeSimulationDiagnostics.js";
import type {SimulationReport} from "../../src/reporting/SimulationReport.js";

function report(): SimulationReport {
    return {
        game: {id: "demo-slot", name: "Demo Slot", version: "0.1.0"},
        requestedRounds: 10_000,
        rounds: 10_000,
        seed: "demo",
        totalBet: 10_000,
        totalWin: 9_440,
        rtp: 0.944,
        hitFrequency: 0.2481,
        maxWin: 38,
        durationMs: 11_783,
        spinsPerSecond: 849,
        workers: 1,
        volatility: 2.7,
        averagePayout: 0.944,
        averagePayoutConfidenceInterval95: {low: 0.89, high: 1},
        rtpConfidenceInterval95: {low: 0.8911, high: 0.9969},
        maxWinFrequency: 0.0002,
        payoutHistogram: {"0": 7519, "1-9": 2355, "10-99": 126},
        warnings: [],
        recommendations: [
            'Use "pokie diff" to compare this report against a previous run after changing the game\'s math.',
            "Save this report as JSON via --out to keep a record you can diff or replay against later.",
        ],
        exactReference: {
            modeName: "base",
            rtp: 0.96768,
            paidSpinRtp: 0.96768,
            hitFrequency: 0.248,
            outcomes: 3125,
            featurePayoutsIncluded: true,
        },
    };
}

describe("simulation report presentation for math authors", () => {
    it("puts the exact reference first and labels the sample maximum honestly in HTML", () => {
        const html = new HtmlSimulationReportRenderer().render(report());
        expect(html).toContain("Exact math reference");
        expect(html).toContain("96.7680%");
        expect(html).toContain("contains the exact RTP");
        expect(html).toContain("Largest observed whole-round win");
        expect(html).not.toContain("Max win:");
        expect(html).toContain("Technical appendix (audit details)");
        expect(html).toContain("<details>");
        expect((html.match(/Keep the JSON export/g) ?? []).length).toBe(1);
    });

    it("removes terminal flags from the rendered next steps and labels the sample maximum honestly in Markdown", () => {
        const markdown = new MarkdownSimulationReportRenderer().render(report());
        expect(markdown).toContain("## Exact math reference");
        expect(markdown).toContain("96.7680%");
        expect(markdown).toContain("contains the exact RTP");
        expect(markdown).toContain("Largest observed whole-round win");
        expect(markdown).not.toContain('"pokie diff"');
        expect(markdown).not.toContain("--out");
        expect(markdown).toContain("Technical appendix (audit details)");
        expect((markdown.match(/Keep the JSON export/g) ?? []).length).toBe(1);
    });

    it("renders a zero-stake feature category as own-stake RTP n/a instead of a misleading 0.00%", () => {
        const source = report();
        source.breakdown = {
            components: {
                base: {rounds: 9900, totalBet: 9900, totalWin: 8800, rtp: 0.8889, contribution: 0.88, hitFrequency: 0.2, maxWin: 20},
                freeGames: {rounds: 100, totalBet: 0, totalWin: 640, rtp: 0, contribution: 0.064, hitFrequency: 0.2, maxWin: 15},
            },
        };

        const markdown = new MarkdownSimulationReportRenderer().render(source);
        const html = new HtmlSimulationReportRenderer().render(source);
        expect(markdown).toContain("Own-stake RTP");
        expect(markdown).toContain("| freeGames | 100 | 0.00 | 640.00 | — | 6.40 pp |");
        expect(html).toContain("Own-stake RTP");
        expect(html).toContain("<td>freeGames</td><td>100</td><td>0.00</td><td>640.00</td><td>—</td>");
    });

    it("attaches the exact reference to the JSON download without changing the persisted report", () => {
        const source = report();
        const withoutReference: SimulationReport = {...source};
        Reflect.deleteProperty(withoutReference, "exactReference");

        const download = buildSimulationReportDownload(withoutReference, "sim-1", "json", source.exactReference);

        const parsed = JSON.parse(download.body) as SimulationReport;
        expect(parsed.exactReference?.rtp).toBe(0.96768);
        expect(parsed.exactReference?.outcomes).toBe(3125);
        expect(withoutReference.exactReference).toBeUndefined();
    });

    it("keeps internal vocabulary and raw component paths out of generated feature analytics", () => {
        const analytics = featureAnalyticsStatistics(emptyFeatureAnalytics());
        analytics.envelope.components = true;
        analytics.components["line/0/Q"] = {type: "line", id: "0", symbol: "Q", occurrences: 93, samples: 93, amount: 476};
        const lines = describeFeatureAnalytics(analytics).join("\n");
        expect(lines).not.toContain("lifecycle");
        expect(lines).not.toContain("canonical");
        expect(lines).toContain("Line 1 · Q");
        expect(lines).not.toContain("Component line/0/Q");
    });
});

describe("simulation payout bucket diagnostics", () => {
    it("names the actual half-open buckets and never calls the counts currency", () => {
        const lines = describeSimulationDiagnostics({
            requestedRounds: 100,
            rounds: 100,
            payoutHistogram: {"0": 75, "1-2": 20, "2-5": 5},
        } as unknown as SimulationReport);
        const joined = lines.join("\n");
        expect(joined).toContain("Payout bucket counts (paid rounds; payout multiples of the bet; labels are half-open [a, b) unless marked legacy)");
        expect(joined).toContain("0 (no win)=75; [1, 2)=20; [2, 5)=5");
        expect(joined).not.toContain("currency amounts");
        expect(joined).not.toContain("(0,10)");
        expect(joined).not.toContain("1–9");
    });
});
