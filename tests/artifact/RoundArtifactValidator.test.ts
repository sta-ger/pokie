import {
    RoundArtifact,
    RoundArtifactProvenance,
    RoundArtifactValidator,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    buildRoundArtifact,
} from "pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function validArtifact(): RoundArtifact<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);

    return buildRoundArtifact({
        roundId: "round-1",
        provenance,
        stake: 1,
        steps: [{screen: symbols.toMatrix(), winEvaluationResult: winCalculator.getWinEvaluationResult()}],
    });
}

describe("RoundArtifactValidator", () => {
    it("reports no issues for a validly-built artifact", () => {
        expect(new RoundArtifactValidator().validate(validArtifact())).toEqual([]);
    });

    it("flags a missing roundId", () => {
        const artifact = {...validArtifact(), roundId: "  "};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-round-id-missing");
    });

    it.each(["id", "name", "version"] as const)("flags a missing provenance.game.%s", (field) => {
        const artifact = validArtifact();
        artifact.provenance.game[field] = "";
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain(`round-artifact-provenance-game-${field}-invalid`);
    });

    it("flags a missing provenance.pokieVersion", () => {
        const artifact = validArtifact();
        artifact.provenance.pokieVersion = "";
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-provenance-pokie-version-invalid");
    });

    it("flags a negative stake", () => {
        const artifact = {...validArtifact(), stake: -1};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-stake-negative");
    });

    it("flags a negative totalWin", () => {
        const artifact = {...validArtifact(), totalWin: -1};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-total-win-negative");
    });

    it("flags a payoutMultiplier that doesn't match totalWin/stake", () => {
        const artifact = {...validArtifact(), payoutMultiplier: 999};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-payout-multiplier-mismatch");
    });

    it("flags empty steps", () => {
        const artifact = {...validArtifact(), steps: []};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-steps-empty");
    });

    it("flags a step whose index is out of sequence", () => {
        const artifact = validArtifact();
        artifact.steps[0] = {...artifact.steps[0], index: 5};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-step-index-out-of-sequence");
    });

    it("flags a round totalWin that doesn't match the sum of each step's totalWin", () => {
        const artifact = {...validArtifact(), totalWin: 123456};
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-total-win-mismatch");
    });

    it("flags a wins count that doesn't match the sum of each step's wins", () => {
        const artifact = validArtifact();
        artifact.wins = [...artifact.wins, artifact.wins[0]];
        const issues = new RoundArtifactValidator().validate(artifact);
        expect(issues.map((issue) => issue.code)).toContain("round-artifact-wins-count-mismatch");
    });
});
