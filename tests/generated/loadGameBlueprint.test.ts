import {loadGameBlueprint} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

describe("loadGameBlueprint", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-load-blueprint-test-"));
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it("parses a well-formed blueprint JSON file", () => {
        const filePath = path.join(dir, "blueprint.json");
        const blueprint = {
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: ["A", "K", "Q"],
            paytable: {A: {3: 5}},
        };
        fs.writeFileSync(filePath, JSON.stringify(blueprint));

        expect(loadGameBlueprint(filePath)).toEqual(blueprint);
    });

    it("throws a descriptive error when the file does not exist", () => {
        expect(() => loadGameBlueprint(path.join(dir, "missing.json"))).toThrow(/Could not read blueprint file/);
    });

    it("throws a descriptive error for invalid JSON", () => {
        const filePath = path.join(dir, "broken.json");
        fs.writeFileSync(filePath, "{not json");

        expect(() => loadGameBlueprint(filePath)).toThrow(/Could not parse ".*" as JSON/);
    });

    it("throws when the JSON is not an object (e.g. an array)", () => {
        const filePath = path.join(dir, "array.json");
        fs.writeFileSync(filePath, "[1, 2, 3]");

        expect(() => loadGameBlueprint(filePath)).toThrow(/must contain a JSON object/);
    });

    it("throws when the JSON is a bare primitive", () => {
        const filePath = path.join(dir, "primitive.json");
        fs.writeFileSync(filePath, "42");

        expect(() => loadGameBlueprint(filePath)).toThrow(/must contain a JSON object/);
    });
});
