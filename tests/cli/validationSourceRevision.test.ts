import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    describeValidationSourceChanges,
    readValidationSourceRevision,
    readValidationSourceSnapshot,
} from "../../cli/validation/readValidationSourceRevision.js";

describe("validation source snapshots", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-validation-source-"));
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    it("keeps the revision stable for unchanged bytes and names the file that changed", () => {
        const source = path.join(root, "game.blueprint.json");
        fs.writeFileSync(source, "{\"info\":{}}");
        const before = readValidationSourceSnapshot(source);

        fs.writeFileSync(source, "{\"info\":{\"id\":\"changed\"}}");
        const after = readValidationSourceSnapshot(source);

        expect(after.revision).not.toBe(before.revision);
        expect(describeValidationSourceChanges(before, after, source)).toContain("modified game.blueprint.json");
    });

    it("reports added files by relative path", () => {
        const source = path.join(root, "project");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "game.blueprint.json"), "{}");
        const before = readValidationSourceSnapshot(source);

        fs.writeFileSync(path.join(source, "sim.json"), "{}");
        const after = readValidationSourceSnapshot(source);

        expect(describeValidationSourceChanges(before, after, source)).toContain("added sim.json");
    });

    it("returns the same revision through the string helper", () => {
        const source = path.join(root, "game.blueprint.json");
        fs.writeFileSync(source, "{}");
        const snapshot = readValidationSourceSnapshot(source);

        expect(readValidationSourceRevision(source)).toBe(snapshot.revision);
    });
});
