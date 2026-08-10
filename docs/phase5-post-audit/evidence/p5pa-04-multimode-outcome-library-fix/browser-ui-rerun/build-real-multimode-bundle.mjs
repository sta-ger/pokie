#!/usr/bin/env node
// Creates the browser-audit fixture through the candidate's compiled public package.
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const {OutcomeLibraryBundleWriter, buildRoundArtifact, ValueWinComponent, WinEvaluationResult, WinningValue} = await import(
    pathToFileURL(resolve(process.cwd(), "dist/esm/index.js")).href,
);

const bundleDir = process.argv[2];
if (!bundleDir) throw new Error("usage: build-real-multimode-bundle.mjs <bundle-dir>");

const provenance = {game: {id: "browser-multimode", name: "Browser Multi-mode Library", version: "1.0.0"}, pokieVersion: "1.3.0"};
const outcome = (libraryId, id, win) => buildRoundArtifact({
    roundId: `${libraryId}-${id}`,
    provenance,
    betMode: "base",
    stake: 1,
    steps: [{screen: [["A"]], winEvaluationResult: win === 0 ? new WinEvaluationResult() : new WinEvaluationResult({valueWins: [new ValueWinComponent(new WinningValue("A", [[0, 0]], win))]})}],
});
const outcomes = (libraryId) => [
    {id: "0", weight: 700, artifact: outcome(libraryId, "0", 0)},
    {id: "1", weight: 250, artifact: outcome(libraryId, "1", 2)},
    {id: "2", weight: 50, artifact: outcome(libraryId, "2", 20)},
];

await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([
    {modeName: "base", libraryId: "base-browser-lib", outcomes: outcomes("base-browser-lib")},
    {modeName: "buyFeature", libraryId: "buy-browser-lib", outcomes: outcomes("buy-browser-lib")},
], bundleDir);
console.log(`Built two real outcome-library modes at ${bundleDir}`);
