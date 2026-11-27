import fs from "fs";
import os from "os";
import path from "path";
import {PROJECT_TYPE_CAPABILITIES, type ProjectResolving} from "@fromstan/pokie";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";

function resolvingOnly(existing: string): ProjectResolving {
    return {
        resolve: (targetPath: string) =>
            targetPath === existing
                ? Promise.resolve({
                    type: "blueprint",
                    rootPath: targetPath,
                    capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                    provenance: "test fixture",
                })
                : Promise.resolve(undefined),
    };
}

describe("DiffCommand", () => {
    it("names a missing comparison path instead of calling it a simulation report", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-missing-"));
        const existing = path.join(directory, "existing.blueprint.json");
        const missing = path.join(directory, "missing.blueprint.json");
        fs.writeFileSync(existing, JSON.stringify({info: {id: "game", name: "Game", version: "0.1.0"}}));
        try {
            const command = new DiffCommand(undefined, undefined, undefined, undefined, resolvingOnly(existing));
            const failure = await command.run([existing, missing]).catch((error: unknown) => error);
            expect(failure).toBeInstanceOf(Error);
            expect((failure as Error).message).toContain(`Cannot compare "${missing}" because it does not exist`);
            expect((failure as Error).message).not.toContain("simulation report with an outcome source");
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});
