import fs from "fs";
import os from "os";
import path from "path";
import {isStakeEngineOutcomeDirectory} from "pokie";

describe("isStakeEngineOutcomeDirectory", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-standalone-detect-test-"));
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it("returns true for a directory with a minimally-shaped index.json, even with no pokie-manifest.json at all", () => {
        fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: [{name: "base", cost: 1, events: "books_base.jsonl.zst", weights: "lookup_base.csv"}]}));

        expect(isStakeEngineOutcomeDirectory(dir)).toBe(true);
        expect(fs.existsSync(path.join(dir, "pokie-manifest.json"))).toBe(false);
    });

    it("returns false when the directory doesn't exist", () => {
        expect(isStakeEngineOutcomeDirectory(path.join(dir, "does-not-exist"))).toBe(false);
    });

    it("returns false when index.json is missing", () => {
        expect(isStakeEngineOutcomeDirectory(dir)).toBe(false);
    });

    it("returns false when index.json isn't valid JSON", () => {
        fs.writeFileSync(path.join(dir, "index.json"), "{not json");

        expect(isStakeEngineOutcomeDirectory(dir)).toBe(false);
    });

    it("returns false when index.json's modes array is empty", () => {
        fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: []}));

        expect(isStakeEngineOutcomeDirectory(dir)).toBe(false);
    });

    it("returns false when a file, not a directory, is passed", () => {
        const filePath = path.join(dir, "not-a-dir.txt");
        fs.writeFileSync(filePath, "hello");

        expect(isStakeEngineOutcomeDirectory(filePath)).toBe(false);
    });
});
