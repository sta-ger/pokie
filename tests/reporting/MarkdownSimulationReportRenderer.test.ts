import {MarkdownSimulationReportRenderer, SimulationReport} from "pokie";

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

describe("MarkdownSimulationReportRenderer", () => {
    it("includes game id/name/version, requested/actual rounds, and seed", () => {
        const markdown = new MarkdownSimulationReportRenderer().render(report);

        expect(markdown).toContain("# Simulation Report: Crazy Fruits");
        expect(markdown).toContain("**Game id**: `crazy-fruits`");
        expect(markdown).toContain("**Game version**: 0.1.0");
        expect(markdown).toContain("**Requested rounds**: 10000");
        expect(markdown).toContain("**Actual rounds**: 9800");
        expect(markdown).toContain("**Seed**: demo");
    });

    it("includes total bet, total win, RTP, hit frequency, max win, duration, and spins per second", () => {
        const markdown = new MarkdownSimulationReportRenderer().render(report);

        expect(markdown).toContain("**Total bet**: 9800.00");
        expect(markdown).toContain("**Total win**: 9331.40");
        expect(markdown).toContain("**RTP**: 95.22%");
        expect(markdown).toContain("**Hit frequency**: 24.10%");
        expect(markdown).toContain("**Max win**: 120.50");
        expect(markdown).toContain("**Duration**: 1234ms");
        expect(markdown).toContain("**Spins per second**: 7942");
    });

    it("renders a placeholder when the seed is null", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({...report, seed: null});

        expect(markdown).toContain("**Seed**: _none_");
    });
});
