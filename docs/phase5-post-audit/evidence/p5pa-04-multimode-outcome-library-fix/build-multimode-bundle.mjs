#!/usr/bin/env node
// Builds a real, two-mode outcome-library bundle on disk using the real, built pokie package --
// OutcomeLibraryBundleWriter and buildRoundArtifact, the exact same primitives
// OutcomeLibraryBundleTestFixtures.ts uses in the unit tests, just driven from the compiled dist
// rather than ts-jest, so a real `pokie studio` process can open it.
import {OutcomeLibraryBundleWriter, buildRoundArtifact, ValueWinComponent, WinEvaluationResult, WinningValue} from "/workspace/dist/esm/index.js";

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
        {id: "1", weight: 300, artifact: outcomeArtifact(`${libraryId}-1`, 2)},
        {id: "2", weight: 150, artifact: outcomeArtifact(`${libraryId}-2`, 5)},
        {id: "3", weight: 40, artifact: outcomeArtifact(`${libraryId}-3`, 10)},
        {id: "4", weight: 10, artifact: outcomeArtifact(`${libraryId}-4`, 100)},
    ];
}

const bundleDir = process.argv[2];
if (!bundleDir) {
    throw new Error("usage: build-multimode-bundle.mjs <bundleDir>");
}

await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
    [
        {modeName: "base", libraryId: "base-lib", outcomes: testOutcomes("base-lib")},
        {modeName: "buyFeature", libraryId: "buy-lib", outcomes: testOutcomes("buy-lib")},
    ],
    bundleDir,
);

console.log(`Built a real two-mode outcome-library bundle at ${bundleDir}`);
