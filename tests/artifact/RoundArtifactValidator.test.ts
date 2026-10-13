import {
    RoundArtifact,
    RoundArtifactProvenance,
    RoundArtifactValidator,
    RoundStepArtifact,
    SymbolsCombination,
    VideoSlotConfig, VideoSlotSession, PublicRoundArtifactProjector, buildRoundArtifactFromSession,
    VideoSlotWinCalculator,
    buildRoundArtifact,
} from "@fromstan/pokie";

import {overscanConfig, overscanGeometry, adversarialScreen} from "../v2/fixtures/OverscanGame.js";

const provenance: RoundArtifactProvenance = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

function codesOf(artifact: RoundArtifact<string>): string[] {
    return new RoundArtifactValidator().validate(artifact).map((issue) => issue.code);
}

describe("RoundArtifactValidator", () => {
    it("reports no issues for a validly-built artifact", () => {
        expect(new RoundArtifactValidator().validate(validArtifact())).toEqual([]);
    });

    it.each(["definition", "symbolsPositions", "wildSymbolsPositions", "winningPositions", "positionCell", "multiplierPositions", "multiplierBreakdown", "metadataPositions"] as const)("rejects sparse canonical %s at validation and public projection boundaries", field => {
        const session = new VideoSlotSession(overscanConfig(), {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(adversarialScreen()).withCoordinates(overscanGeometry)});
        session.play();
        const artifact = buildRoundArtifactFromSession(session, {roundId: "sparse", provenance});
        expect(codesOf(artifact)).toEqual([]);
        expect(() => new PublicRoundArtifactProjector().project(artifact)).not.toThrow();
        const sparse = new Array<number>(5);
        sparse[0] = sparse[1] = sparse[2] = 0;
        let win = {...artifact.wins[0]};
        if (field === "definition" || field === "symbolsPositions" || field === "wildSymbolsPositions") {
            win = {...win, metadata: {...win.metadata, [field]: sparse}};
        } else if (field === "winningPositions" || field === "positionCell") {
            win = {...win, winningPositions: field === "positionCell" ? [new Array<number>(2)] : new Array<number[]>(1)};
        } else if (field === "multiplierPositions") {
            win = {...win, multiplierBreakdown: [{source: "custom", positions: new Array<number[]>(1), values: [2], combinedMultiplier: 2}]};
        } else if (field === "multiplierBreakdown") {
            const breakdown = [...win.multiplierBreakdown];
            breakdown.length = 1;
            win = {...win, multiplierBreakdown: breakdown};
        } else {
            win = {...win, type: "value", metadata: {symbolsPositions: new Array<number[]>(1)}};
        }
        const malformed = {...artifact, wins: [win], steps: [{...artifact.steps[0], wins: [win]}]};
        expect(codesOf(malformed)).toContain("round-artifact-coordinates-invalid");
        expect(() => new PublicRoundArtifactProjector().project(malformed)).toThrow(/Artifact|integer/);
    });

    it("flags an empty roundId", () => {
        expect(codesOf({...validArtifact(), roundId: "  "})).toContain("round-artifact-round-id-invalid");
    });

    it.each(["id", "name", "version"] as const)("flags an empty provenance.game.%s", (field) => {
        const artifact = validArtifact();
        const withBadField = {
            ...artifact,
            provenance: {...artifact.provenance, game: {...artifact.provenance.game, [field]: ""}},
        };
        expect(codesOf(withBadField)).toContain(`round-artifact-provenance-game-${field}-invalid`);
    });

    it("flags an empty provenance.pokieVersion", () => {
        const artifact = validArtifact();
        const withBadProvenance = {...artifact, provenance: {...artifact.provenance, pokieVersion: ""}};
        expect(codesOf(withBadProvenance)).toContain("round-artifact-provenance-pokie-version-invalid");
    });

    it.each([-1, NaN, Infinity])("flags an invalid stake %p", (stake) => {
        expect(codesOf({...validArtifact(), stake})).toContain("round-artifact-stake-invalid");
    });

    it.each([-1, NaN, Infinity])("flags an invalid totalWin %p", (totalWin) => {
        expect(codesOf({...validArtifact(), totalWin})).toContain("round-artifact-total-win-invalid");
    });

    it("flags a payoutMultiplier that doesn't match totalWin/stake", () => {
        expect(codesOf({...validArtifact(), payoutMultiplier: 999})).toContain("round-artifact-payout-multiplier-mismatch");
    });

    it.each([0, -1, 1.5, 2])("flags an invalid/unsupported schemaVersion %p", (schemaVersion) => {
        const artifact = {...validArtifact(), schemaVersion};
        const codes = codesOf(artifact);
        expect(
            codes.includes("round-artifact-schema-version-invalid") || codes.includes("round-artifact-schema-version-unsupported"),
        ).toBe(true);
    });

    it("flags empty steps", () => {
        expect(codesOf({...validArtifact(), steps: []})).toContain("round-artifact-steps-empty");
    });

    it("flags a step whose index is out of sequence", () => {
        const artifact = validArtifact();
        const steps: readonly RoundStepArtifact<string>[] = [{...artifact.steps[0], index: 5}];
        expect(codesOf({...artifact, steps})).toContain("round-artifact-step-index-out-of-sequence");
    });

    it("flags a step whose own totalWin doesn't match the sum of its own wins", () => {
        const artifact = validArtifact();
        const steps: readonly RoundStepArtifact<string>[] = [{...artifact.steps[0], totalWin: artifact.steps[0].totalWin + 500}];
        expect(codesOf({...artifact, steps})).toContain("round-artifact-step-total-win-mismatch");
    });

    it("flags a round totalWin that doesn't match the sum of each step's totalWin", () => {
        expect(codesOf({...validArtifact(), totalWin: 123456})).toContain("round-artifact-total-win-mismatch");
    });

    it("flags a wins count that doesn't match the sum of each step's wins", () => {
        const artifact = validArtifact();
        expect(codesOf({...artifact, wins: [...artifact.wins, artifact.wins[0]]})).toContain(
            "round-artifact-wins-count-mismatch",
        );
    });

    it("flags a wins array with the same count as the steps' wins but different content", () => {
        const artifact = validArtifact();
        expect(artifact.wins.length).toBeGreaterThan(0);
        const swappedWins = [...artifact.wins];
        swappedWins[0] = {...swappedWins[0], winAmount: swappedWins[0].winAmount + 1};

        const issues = new RoundArtifactValidator().validate({...artifact, wins: swappedWins});
        const codes = issues.map((issue) => issue.code);

        // same length, so the count check alone would miss this — only the deep comparison catches it
        expect(codes).not.toContain("round-artifact-wins-count-mismatch");
        expect(codes).toContain("round-artifact-wins-mismatch");
    });

    it("flags an invalid (negative) win amount", () => {
        const artifact = validArtifact();
        const wins = [{...artifact.wins[0], winAmount: -5}, ...artifact.wins.slice(1)];
        expect(codesOf({...artifact, wins})).toContain("round-artifact-win-amount-invalid");
    });

    it("flags a screen that doesn't match the last step's screen", () => {
        const artifact = validArtifact();
        expect(codesOf({...artifact, screen: [["Z", "Z", "Z"]]})).toContain("round-artifact-screen-mismatch");
    });

    it("does not flag a screen that matches the last step's screen even across multiple steps", () => {
        const artifact = validArtifact();
        const twoSteps: readonly RoundStepArtifact<string>[] = [
            artifact.steps[0],
            {...artifact.steps[0], index: 1},
        ];
        const totalWin = twoSteps.reduce((sum, step) => sum + step.totalWin, 0);
        const multiStep = {
            ...artifact,
            steps: twoSteps,
            totalWin,
            wins: twoSteps.flatMap((step) => step.wins),
            screen: twoSteps[1].screen,
        };
        expect(codesOf(multiStep)).not.toContain("round-artifact-screen-mismatch");
    });

    it("flags a feature event with a missing/empty type", () => {
        const artifact = validArtifact();
        const withBadEvent = {...artifact, featureEvents: [{type: ""}]};
        expect(codesOf(withBadEvent)).toContain("round-artifact-feature-event-type-invalid");
    });

    it("flags a step-level feature event with a missing/empty type", () => {
        const artifact = validArtifact();
        const steps: readonly RoundStepArtifact<string>[] = [{...artifact.steps[0], featureEvents: [{type: "  "}]}];
        expect(codesOf({...artifact, steps})).toContain("round-artifact-feature-event-type-invalid");
    });

    it("flags non-JSON-safe content (a circular debug reference) as round-artifact-not-json-safe", () => {
        const artifact = validArtifact();
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const invalid = {...artifact, debug: cyclic} as unknown as RoundArtifact<string>;

        expect(codesOf(invalid)).toContain("round-artifact-not-json-safe");
    });

    it("never throws, even for a completely malformed artifact", () => {
        const malformed = {completely: "wrong"} as unknown as RoundArtifact<string>;
        expect(() => new RoundArtifactValidator().validate(malformed)).not.toThrow();
        const issues = new RoundArtifactValidator().validate(malformed);
        expect(issues.length).toBeGreaterThan(0);
    });

    it("never throws for null/primitive garbage passed in place of an artifact", () => {
        expect(() => new RoundArtifactValidator().validate(null as unknown as RoundArtifact<string>)).not.toThrow();
        expect(() => new RoundArtifactValidator().validate(42 as unknown as RoundArtifact<string>)).not.toThrow();
        expect(() => new RoundArtifactValidator().validate("nope" as unknown as RoundArtifact<string>)).not.toThrow();
    });

    it("never throws for a cyclic artifact passed directly (not just via debug)", () => {
        const cyclic: Record<string, unknown> = {roundId: "r"};
        cyclic.self = cyclic;
        expect(() => new RoundArtifactValidator().validate(cyclic as unknown as RoundArtifact<string>)).not.toThrow();
    });
});
