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
        const withoutReproducibility: SimulationReport = {...report, reproducibility: undefined};
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

    it("omits the Breakdown section when the report has no breakdown field (old report JSON)", () => {
        const markdown = new MarkdownSimulationReportRenderer().render(report);

        expect(markdown).not.toContain("## Breakdown");
    });

    it("renders a Breakdown section with one row per category", () => {
        const markdown = new MarkdownSimulationReportRenderer().render({
            ...report,
            breakdown: {
                components: {
                    base: {rounds: 8820, totalBet: 8820, totalWin: 7938, rtp: 0.9, hitFrequency: 0.2, maxWin: 90},
                    freeGames: {rounds: 980, totalBet: 980, totalWin: 1393.4, rtp: 1.4218367346938776, hitFrequency: 0.6, maxWin: 120.5},
                },
            },
        });

        expect(markdown).toContain("## Breakdown");
        expect(markdown).toContain("| base | 8820 | 8820.00 | 7938.00 | 90.00% | 20.00% | 90.00 |");
        expect(markdown).toContain("| freeGames | 980 | 980.00 | 1393.40 | 142.18% | 60.00% | 120.50 |");
    });
});
