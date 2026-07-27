import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {StakeEngineExporter} from "pokie";
import {buildSingleOutcomeStakeEngineLibrary} from "./StakeEngineTestFixtures.js";

// StakeEngineExporter.test.ts already asserts CSV/book/index/manifest contents, but it derives every
// expected value from the same formula the exporter itself uses (e.g. `outcome.artifact.payoutMultiplier
// * mode.cost * 100`) -- a bug in that shared formula could ship undetected because the test computes
// its expectation the same wrong way. This pins the literal exact bytes one small, fixed library
// produces, computed independently and hardcoded, so a regression in the formula itself is also caught.
describe("StakeEngineExporter golden fixture", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-golden-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("exports a single-outcome, cost-1 base mode to the exact known bytes", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "golden-lib", betMode: "base", stake: 1, totalWin: 2});
        const exporter = new StakeEngineExporter("1.3.0");

        const result = await exporter.exportToDirectory([{modeName: "base", cost: 1, library}], outDir);

        expect(result.issues).toEqual([]);
        expect(new Set(result.files)).toEqual(new Set(["lookup_base.csv", "books_base.jsonl.zst", "index.json", "pokie-manifest.json"]));

        expect(JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8"))).toEqual({
            modes: [{name: "base", cost: 1, events: "books_base.jsonl.zst", weights: "lookup_base.csv"}],
        });

        expect(fs.readFileSync(path.join(outDir, "lookup_base.csv"), "utf-8")).toBe("0,1,200\n");

        const bookLines = zlib
            .zstdDecompressSync(fs.readFileSync(path.join(outDir, "books_base.jsonl.zst")))
            .toString("utf-8")
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line));
        expect(bookLines).toEqual([
            {
                id: 0,
                events: [
                    {type: "reveal", board: [["A"]], index: 0},
                    {type: "win", amount: 200, index: 1},
                    {type: "finalWin", amount: 200, payoutMultiplier: 200, index: 2},
                ],
                payoutMultiplier: 200,
            },
        ]);

        const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "pokie-manifest.json"), "utf-8"));
        expect(manifest.modes).toEqual([
            {
                name: "base",
                betMode: "base",
                stake: 1,
                cost: 1,
                outcomeCount: 1,
                libraryId: "golden-lib",
                libraryHash: "sha256:46e7686421c7e43c1cbc633d15be139707b23b0164f1e85af2d34854ccfb17c4",
                events: "books_base.jsonl.zst",
                weights: "lookup_base.csv",
            },
        ]);
    });
});
