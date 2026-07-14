import {
    PokieJsonRoundArtifactProjector,
    RoundArtifact,
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    buildRoundArtifact,
    computeRoundArtifactHash,
} from "pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function sampleArtifact(): RoundArtifact<string> {
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
        debug: {rngSeed: "abc"},
        steps: [{screen: symbols.toMatrix(), winEvaluationResult: winCalculator.getWinEvaluationResult()}],
    });
}

describe("PokieJsonRoundArtifactProjector", () => {
    it("stamps the projection with computeRoundArtifactHash's own output", () => {
        const artifact = sampleArtifact();
        const json = new PokieJsonRoundArtifactProjector().project(artifact);

        expect(json.hash).toBe(computeRoundArtifactHash(artifact));
        expect(json.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("carries every RoundArtifact field through unchanged, aside from adding hash", () => {
        const artifact = sampleArtifact();
        const {hash: _hash, ...json} = new PokieJsonRoundArtifactProjector().project(artifact);

        expect(json).toEqual(artifact);
    });

    it("round-trips through JSON.stringify/parse to an identical hash", () => {
        const artifact = sampleArtifact();
        const json = new PokieJsonRoundArtifactProjector().project(artifact);
        const {hash: _hash, ...roundTripped} = JSON.parse(JSON.stringify(json));

        expect(computeRoundArtifactHash(roundTripped)).toBe(json.hash);
    });

    it("produces the same hash regardless of the source artifact's own key order", () => {
        const artifact = sampleArtifact();
        const reordered: RoundArtifact<string> = {
            wins: artifact.wins,
            steps: artifact.steps,
            screen: artifact.screen,
            payoutMultiplier: artifact.payoutMultiplier,
            totalWin: artifact.totalWin,
            stake: artifact.stake,
            betMode: artifact.betMode,
            provenance: artifact.provenance,
            roundId: artifact.roundId,
            schemaVersion: artifact.schemaVersion,
            debug: artifact.debug,
        };

        expect(computeRoundArtifactHash(reordered)).toBe(computeRoundArtifactHash(artifact));
    });

    it("changes the hash when a semantic field changes", () => {
        const artifact = sampleArtifact();
        const changed: RoundArtifact<string> = {...artifact, totalWin: artifact.totalWin + 1};

        expect(computeRoundArtifactHash(changed)).not.toBe(computeRoundArtifactHash(artifact));
    });
});
