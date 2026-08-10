#!/usr/bin/env node
// Builds a real Stake Engine export directory using the real, built pokie package's StakeEngineExporter --
// a "stakeAdapter" project has no PreGeneratedOutcomeSourcing-style draw contract of its own (see
// OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) -- used to prove Play/Sampling/Simulation/Replay are
// honestly refused for it by the real, running Studio server, never silently offered.
import {StakeEngineExporter, buildRoundArtifact, ValueWinComponent, WinEvaluationResult, WinningValue, buildWeightedOutcomeLibrary} from "/workspace/dist/esm/index.js";

const provenance = {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.3.0"};

function winEvaluationResultFor(totalWin) {
    return totalWin === 0 ? new WinEvaluationResult() : new WinEvaluationResult({valueWins: [new ValueWinComponent(new WinningValue("A", [[0, 0]], totalWin))]});
}

function outcomeArtifact(roundId, totalWin) {
    return buildRoundArtifact({roundId, provenance, betMode: "base", stake: 1, steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(totalWin)}]});
}

function testOutcomes(libraryId) {
    return [
        {id: "0", weight: 500, artifact: outcomeArtifact(`${libraryId}-0`, 0)},
        {id: "1", weight: 500, artifact: outcomeArtifact(`${libraryId}-1`, 2)},
    ];
}

const stakeDir = process.argv[2];
if (!stakeDir) {
    throw new Error("usage: build-stake-export.mjs <stakeDir>");
}

const library = buildWeightedOutcomeLibrary({libraryId: "base-lib", outcomes: testOutcomes("base-lib")});
await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);

console.log(`Built a real Stake Engine export at ${stakeDir}`);
