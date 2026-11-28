import fs from "fs";
import os from "os";
import path from "path";
import {assertBlueprintImportDestination} from "../../../cli/commands/internal/assertBlueprintImportDestination.js";

describe("assertBlueprintImportDestination", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-destination-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("accepts the JSON suffix POKIE uses to recognize a Blueprint", () => {
        expect(() => assertBlueprintImportDestination("game.blueprint.json")).not.toThrow();
        expect(() => assertBlueprintImportDestination("GAME.JSON")).not.toThrow();
        expect(() => assertBlueprintImportDestination(path.join(workDir, "new.json"))).not.toThrow();
    });

    it("rejects an extensionless import path before writing anything", () => {
        expect(() => assertBlueprintImportDestination("game")).toThrow(/ending in "\.json"/);
        expect(() => assertBlueprintImportDestination("game.txt")).toThrow(/ending in "\.json"/);
    });

    it("rejects a folder named like a Blueprint instead of failing later in the atomic writer", () => {
        const folder = path.join(workDir, "folder.json");
        fs.mkdirSync(folder);
        expect(() => assertBlueprintImportDestination(folder)).toThrow(`"${folder}" is a folder, not a file. Choose a different file path.`);
    });

    it("describes a path whose parent is a file", () => {
        const parent = path.join(workDir, "parent.json");
        fs.writeFileSync(parent, "{}");
        expect(() => assertBlueprintImportDestination(path.join(parent, "child.json"))).toThrow(/is inside a file, not a folder/);
    });
});
