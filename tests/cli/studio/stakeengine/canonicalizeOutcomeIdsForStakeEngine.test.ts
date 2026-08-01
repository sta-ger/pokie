import {buildRoundArtifact, buildWeightedOutcomeLibrary, WeightedOutcomeLibrary, WinEvaluationResult} from "pokie";
import {canonicalizeOutcomeIdsForStakeEngine} from "../../../../cli/studio/stakeengine/canonicalizeOutcomeIdsForStakeEngine.js";
import {buildStakeEngineTestLibrary} from "../../../stakeengine/StakeEngineTestFixtures.js";

const provenance = {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.3.0"};

function contentAddressedLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary<string>({
        libraryId: "generated-lib",
        outcomes: [
            {
                id: "outcome-b2c3",
                weight: 4,
                artifact: buildRoundArtifact({roundId: "round-b", provenance, betMode: "base", stake: 1, steps: [{screen: [["B"]], winEvaluationResult: new WinEvaluationResult<string>()}]}),
            },
            {
                id: "outcome-a1b2",
                weight: 2,
                artifact: buildRoundArtifact({roundId: "round-a", provenance, betMode: "base", stake: 1, steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}]}),
            },
        ],
    });
}

describe("canonicalizeOutcomeIdsForStakeEngine", () => {
    it("leaves a library whose outcome ids are already canonical non-negative integers unchanged", () => {
        const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});

        const result = canonicalizeOutcomeIdsForStakeEngine(library);

        expect(result).toEqual({status: "ok", library});
    });

    it("relabels a library whose outcome ids are content-addressed (not Stake-compatible) into sequential integer ids, preserving weight/artifact/provenance", () => {
        const library = contentAddressedLibrary();

        const result = canonicalizeOutcomeIdsForStakeEngine(library);

        if (result.status !== "ok") throw new Error("expected ok");
        expect(result.library.libraryId).toBe(library.libraryId);
        expect(result.library.outcomes).toHaveLength(2);
        result.library.outcomes.forEach((outcome) => expect(outcome.id).toMatch(/^(0|[1-9]\d*)$/));
        // The exact same relabeling, applied twice to the exact same source library, is always identical --
        // never an incidentally-diverging mapping.
        expect(canonicalizeOutcomeIdsForStakeEngine(contentAddressedLibrary())).toEqual(result);
        // weight/artifact (and therefore provenance) survive untouched -- only "id" changes.
        const byRoundId = new Map(result.library.outcomes.map((outcome) => [outcome.artifact.roundId, outcome]));
        expect(byRoundId.get("round-a")?.weight).toBe(2);
        expect(byRoundId.get("round-b")?.weight).toBe(4);
        expect(byRoundId.get("round-a")?.artifact.provenance).toEqual(provenance);
    });
});
