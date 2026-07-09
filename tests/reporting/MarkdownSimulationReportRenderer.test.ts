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

    it("renders a Reproducibility section with game/seed/rounds/re-run command", () => {
        const markdown = new MarkdownSimulationReportRenderer().render(report);

        expect(markdown).toContain("## Reproducibility");
        expect(markdown).toContain("**Game**: Crazy Fruits (`crazy-fruits`, v0.1.0)");
        expect(markdown).toContain("**Requested rounds**: 10000");
        expect(markdown).toContain("**Actual rounds**: 9800");
        expect(markdown).toContain("**Re-run command**: `pokie sim <packageRoot> --rounds 10000 --seed demo`");
    });

    it("omits the Reproducibility section when the report has no reproducibility field (old report JSON)", () => {
        const withoutReproducibility = {...report, reproducibility: undefined} as unknown as SimulationReport;
        const markdown = new MarkdownSimulationReportRenderer().render(withoutReproducibility);

        expect(markdown).not.toContain("## Reproducibility");
    });

    it("renders a Warnings section with each warning as a bullet", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({
            ...report,
            warnings: ["No seed was provided — this run is not reproducible.", "Max win is 0 — no round produced a payout."],
        });

        expect(markdown).toContain("## Warnings");
        expect(markdown).toContain("- No seed was provided — this run is not reproducible.");
        expect(markdown).toContain("- Max win is 0 — no round produced a payout.");
    });

    it("omits the Warnings section when there are no warnings", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({...report, warnings: []});

        expect(markdown).not.toContain("## Warnings");
    });

    it("renders a Recommendations section with each recommendation as a bullet", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({
            ...report,
            recommendations: ['Use "pokie diff" to compare this report against a previous run after changing the game\'s math.'],
        });

        expect(markdown).toContain("## Recommendations");
        expect(markdown).toContain('- Use "pokie diff" to compare this report against a previous run after changing the game\'s math.');
    });

    it("omits the Recommendations section when there are no recommendations", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({...report, recommendations: []});

        expect(markdown).not.toContain("## Recommendations");
    });
});
