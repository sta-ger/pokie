import fs from "fs";
import os from "os";
import path from "path";
import {buildWeightedOutcomeLibrary, WeightedOutcomeLibraryAnalyzer, OutcomeLibraryBundleWriter, OutcomeLibraryBundleValidator, OutcomeLibraryBundleReader} from "pokie";
import {computeOnlineWeightedOutcomeLibraryAnalysis} from "../../../../src/weightedoutcome/bundle/internal/computeOnlineWeightedOutcomeLibraryAnalysis.js";
import {artifactWithTotalWin} from "../../WeightedOutcomeTestFixtures.js";
import {expectRelative} from "../../../stakeengine/standalone/StakeProbabilityTestFixtures.js";

it("agrees online/direct JSONL, in memory, published manifest and deep validation at the native safe total boundary", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p9-online-"));
    try {
        // Persisted native weights AND totals must be safe integers: no unsupported UInt64 fixture here.
        const outcomes = [
            {id: "loss", weight: Number.MAX_SAFE_INTEGER - 1, artifact: artifactWithTotalWin("loss", 0)},
            {id: "win", weight: 1, artifact: artifactWithTotalWin("win", 2)},
        ];
        const library = buildWeightedOutcomeLibrary({libraryId: "rare-native", outcomes});
        const expected = new WeightedOutcomeLibraryAnalyzer().analyze(library);
        const jsonl = path.join(dir, "outcomes.jsonl");
        fs.writeFileSync(jsonl, outcomes.map((outcome) => JSON.stringify(outcome)).join("\n") + "\n");
        const online = await computeOnlineWeightedOutcomeLibraryAnalysis(jsonl, Number.MAX_SAFE_INTEGER);
        expect(online).toEqual(expected);
        expectRelative(online.hitFrequency, 1 / Number.MAX_SAFE_INTEGER);
        expectRelative(online.variance, 4 / Number.MAX_SAFE_INTEGER);
        const bundle = path.join(dir, "bundle");
        const publication = await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "rare-native", outcomes}], bundle);
        expect(publication.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        const manifest = await new OutcomeLibraryBundleReader().readManifest(bundle);
        expect(manifest.modes[0].analysis).toEqual(expected);
        expect((await new OutcomeLibraryBundleValidator().validate(bundle, {deep: true})).filter((issue) => issue.severity === "error")).toEqual([]);
    } finally {
        fs.rmSync(dir, {recursive: true, force: true});
    }
});
