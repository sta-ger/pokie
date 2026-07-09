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
});
