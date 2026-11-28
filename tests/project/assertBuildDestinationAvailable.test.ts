import fs from "fs";
import os from "os";
import path from "path";
import {BuildConflictError} from "../../src/project/BuildConflictError.js";
import {assertBuildDestinationAvailable} from "../../src/project/internal/assertBuildDestinationAvailable.js";

describe("assertBuildDestinationAvailable", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-destination-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("keeps the ordinary missing/empty/file/directory policies", () => {
        expect(() => assertBuildDestinationAvailable(path.join(workDir, "new"), "directory")).not.toThrow();
        expect(() => assertBuildDestinationAvailable(path.join(workDir, "new.json"), "file")).not.toThrow();

        const file = path.join(workDir, "occupied.json");
        fs.writeFileSync(file, "content");
        expect(() => assertBuildDestinationAvailable(file, "file")).toThrow(/already exists.*never overwrites/i);
        expect(() => assertBuildDestinationAvailable(file, "directory")).toThrow(/not a directory/i);

        const directory = path.join(workDir, "occupied");
        fs.mkdirSync(directory);
        expect(() => assertBuildDestinationAvailable(directory, "directory")).not.toThrow();
        fs.writeFileSync(path.join(directory, "child"), "content");
        expect(() => assertBuildDestinationAvailable(directory, "directory")).toThrow(/not empty/i);
    });

    it("names a path whose parent is a file instead of leaking ENOTDIR", () => {
        const parent = path.join(workDir, "parent.json");
        fs.writeFileSync(parent, "{}");
        expect(() => assertBuildDestinationAvailable(path.join(parent, "child.json"), "file")).toThrow(
            BuildConflictError,
        );
        expect(() => assertBuildDestinationAvailable(path.join(parent, "child.json"), "file")).toThrow(
            /is inside a file, not a folder/,
        );
    });

    it("names an overlong destination instead of leaking ENAMETOOLONG", () => {
        expect(() => assertBuildDestinationAvailable(path.join(workDir, `${"a".repeat(300)}.json`), "file")).toThrow(
            /too long for this filesystem/,
        );
    });
});
