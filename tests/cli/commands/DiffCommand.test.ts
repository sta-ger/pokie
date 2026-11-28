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
    function simulationReport(): object {
        return {
            game: {id: "game", name: "Game", version: "0.1.0"},
            requestedRounds: 10,
            rounds: 10,
            seed: "seed",
            totalBet: 10,
            totalWin: 1,
            rtp: 0.1,
            hitFrequency: 0.1,
            maxWin: 1,
            durationMs: 1,
            spinsPerSecond: 1,
        };
    }

    it("refuses to compare simulation reports as mathematical definitions", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-report-definition-"));
        const left = path.join(directory, "left.json");
        const right = path.join(directory, "right.json");
        fs.writeFileSync(left, JSON.stringify(simulationReport()));
        fs.writeFileSync(right, JSON.stringify(simulationReport()));
        try {
            await expect(new DiffCommand().run([left, right, "--comparison", "definition"])).rejects.toThrow(
                /it is a simulation report/,
            );
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

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

    it("names an --out path whose parent is a file instead of printing raw ENOTDIR", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-out-"));
        const left = path.join(directory, "left.json");
        const right = path.join(directory, "right.json");
        const parent = path.join(directory, "parent.json");
        fs.writeFileSync(left, JSON.stringify(simulationReport()));
        fs.writeFileSync(right, JSON.stringify(simulationReport()));
        fs.writeFileSync(parent, "{}");
        try {
            await expect(new DiffCommand().run([left, right, "--format", "json", "--out", path.join(parent, "diff.json")]))
                .rejects.toThrow(/is inside a file, not a folder/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});
