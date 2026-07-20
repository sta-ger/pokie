import {HtmlSimulationReportRenderer, SimulationReport} from "pokie";

const report: SimulationReport = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    requestedRounds: 10000,
    rounds: 9800,
    seed: "demo",
    totalBet: 9800,
    totalWin: 9331.4,
    rtp: 0.9522,
    hitFrequency: 0.241,
    maxWin: 120.5,
    durationMs: 1234,
    spinsPerSecond: 7942,
    reproducibility: {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: "demo",
        requestedRounds: 10000,
        actualRounds: 9800,
        command: "pokie sim <packageRoot> --rounds 10000 --seed demo",
    },
    warnings: [],
    recommendations: [],
};

describe("HtmlSimulationReportRenderer", () => {
    it("renders semantic, well-formed HTML with a title and heading", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>Simulation Report: Crazy Fruits</title>");
        expect(html).toContain("<h1>Simulation Report: Crazy Fruits</h1>");
        expect(html).toContain("<table>");
    });

    it("includes game id/name/version, requested/actual rounds, and seed", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).toContain("<td>crazy-fruits</td>");
        expect(html).toContain("<td>0.1.0</td>");
        expect(html).toContain("<td>10000</td>");
        expect(html).toContain("<td>9800</td>");
        expect(html).toContain("<td>demo</td>");
    });

    it("includes total bet, total win, RTP, hit frequency, max win, duration, and spins per second", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).toContain("<td>9800.00</td>");
        expect(html).toContain("<td>9331.40</td>");
        expect(html).toContain("<td>95.22%</td>");
        expect(html).toContain("<td>24.10%</td>");
        expect(html).toContain("<td>120.50</td>");
        expect(html).toContain("<td>1234ms</td>");
        expect(html).toContain("<td>7942</td>");
    });

    it("escapes HTML-sensitive characters in game name/id/version/seed", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            game: {id: "<id>", name: "Fruits & <script>alert(1)</script>", version: "1.0.0"},
            seed: "\"quoted\" & 'seed'",
        });

        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("&lt;id&gt;");
        expect(html).toContain("&quot;quoted&quot; &amp; &#39;seed&#39;");
    });

    it("renders a placeholder when the seed is null", () => {
        const html = new HtmlSimulationReportRenderer().render({...report, seed: null});

        expect(html).toContain("<td>none</td>");
    });

    it("renders a Reproducibility section with game/seed/rounds/re-run command", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).toContain("<h2>Reproducibility</h2>");
        expect(html).toContain("Game: Crazy Fruits (crazy-fruits, v0.1.0)");
        expect(html).toContain("Requested rounds: 10000");
        expect(html).toContain("Actual rounds: 9800");
        expect(html).toContain("Re-run command: <code>pokie sim &lt;packageRoot&gt; --rounds 10000 --seed demo</code>");
    });

    it("omits the Reproducibility section when the report has no reproducibility field (old report JSON)", () => {
        const withoutReproducibility: SimulationReport = {...report, reproducibility: undefined};
        const html = new HtmlSimulationReportRenderer().render(withoutReproducibility);

        expect(html).not.toContain("Reproducibility");
    });

    it("renders a Warnings section with each warning as a list item, escaped", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            warnings: ["No seed was provided — this run is not reproducible.", "<script>alert(1)</script>"],
        });

        expect(html).toContain("<h2>Warnings</h2>");
        expect(html).toContain("<li>No seed was provided — this run is not reproducible.</li>");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("omits the Warnings section when there are no warnings", () => {
        const html = new HtmlSimulationReportRenderer().render({...report, warnings: []});

        expect(html).not.toContain("Warnings");
    });

    it("renders a Recommendations section with each recommendation as a list item", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            recommendations: ["Run with --seed <value> to make this simulation reproducible."],
        });

        expect(html).toContain("<h2>Recommendations</h2>");
        expect(html).toContain("Run with --seed &lt;value&gt; to make this simulation reproducible.");
    });

    it("omits the Recommendations section when there are no recommendations", () => {
        const html = new HtmlSimulationReportRenderer().render({...report, recommendations: []});

        expect(html).not.toContain("Recommendations");
    });

    it("omits the Breakdown section when the report has no breakdown field (old report JSON)", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).not.toContain("Breakdown");
    });

    it("renders a Breakdown section with one table row per category, including contribution, escaped", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            breakdown: {
                components: {
                    base: {rounds: 8820, totalBet: 8820, totalWin: 7938, rtp: 0.9, contribution: 0.81, hitFrequency: 0.2, maxWin: 90},
                    "<bonus>": {
                        rounds: 980,
                        totalBet: 980,
                        totalWin: 1393.4,
                        rtp: 1.4218367346938776,
                        contribution: 0.14218367346938776,
                        hitFrequency: 0.6,
                        maxWin: 120.5,
                    },
                },
            },
        });

        expect(html).toContain("<h2>Breakdown</h2>");
        expect(html).toContain("<td>base</td><td>8820</td><td>8820.00</td><td>7938.00</td><td>90.00%</td><td>81.00 pp</td><td>20.00%</td><td>90.00</td>");
        expect(html).toContain(
            "<td>&lt;bonus&gt;</td><td>980</td><td>980.00</td><td>1393.40</td><td>142.18%</td><td>14.22 pp</td><td>60.00%</td><td>120.50</td>",
        );
    });

    it("omits the Convergence section and Stop reason row when the report never enabled convergence (old/legacy report)", () => {
        const html = new HtmlSimulationReportRenderer().render(report);

        expect(html).not.toContain("Convergence");
        expect(html).not.toContain("Stop reason");
    });

    it("renders Stop reason and a Convergence section for a converged run, with requested/actual rounds already present", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            requestedRounds: 5_000_000,
            rounds: 150_000,
            stopReason: "converged",
            convergence: {
                minRounds: 100_000,
                rtpTolerance: 0.002,
                checkIntervalRounds: 25_000,
                stableChecks: 3,
                checksPerformed: 3,
                consecutiveStableChecks: 3,
                achievedRtpHalfWidth: 0.0015,
            },
        });

        expect(html).toContain("<td>5000000</td>");
        expect(html).toContain("<td>150000</td>");
        expect(html).toContain("<th scope=\"row\">Stop reason</th><td>converged</td>");
        expect(html).toContain("<h2>Convergence</h2>");
        expect(html).toContain("Min rounds: 100000");
        expect(html).toContain("RTP tolerance: 0.200 pp");
        expect(html).toContain("Check interval: 25000");
        expect(html).toContain("Stable checks required: 3");
        expect(html).toContain("Checks performed: 3");
        expect(html).toContain("Consecutive stable checks: 3");
        expect(html).toContain("Achieved RTP half-width: 0.150 pp");
    });

    it("renders Stop reason 'maxRounds' and a Convergence section for a run that never satisfied its own criteria (fallback)", () => {
        const html = new HtmlSimulationReportRenderer().render({
            ...report,
            requestedRounds: 1000,
            rounds: 1000,
            stopReason: "maxRounds",
            convergence: {
                minRounds: 10_000,
                rtpTolerance: 0.001,
                checkIntervalRounds: 200,
                stableChecks: 3,
                checksPerformed: 5,
                consecutiveStableChecks: 0,
                achievedRtpHalfWidth: 0.08,
            },
        });

        expect(html).toContain("<th scope=\"row\">Stop reason</th><td>maxRounds</td>");
        expect(html).toContain("<h2>Convergence</h2>");
        expect(html).toContain("Min rounds: 10000");
        expect(html).toContain("Consecutive stable checks: 0");
        expect(html).toContain("Achieved RTP half-width: 8.000 pp");
    });
});
