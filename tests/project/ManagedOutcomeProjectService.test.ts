import fs from "fs";
import os from "os";
import path from "path";
import {
    ManagedOutcomeProjectService,
    type ManagedOutcomeProjectFileOperations,
    OutcomeLibraryBundleWriter,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

describe("ManagedOutcomeProjectService atomic registry writes", () => {
    it.each(["write", "rename"])("removes a temporary registry fragment and does not register a Project when %s fails", async (failure) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-registry-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomePath = path.join(workDir, "outcome");
        const compatibility = {gameId: "sample-slot", gameVersion: "0.1.0", configHash: "config-hash", pokieVersion: "1.3.0"};
        fs.writeFileSync(blueprintPath, "{}");
        const baseMode = buildOutcomeLibraryBundleModeInput("base", "base");
        const modes = [
            {
                ...baseMode,
                outcomes: Array.from(baseMode.outcomes, (outcome) => ({
                    ...outcome,
                    artifact: {...outcome.artifact, provenance: {...outcome.artifact.provenance, configHash: compatibility.configHash}},
                })),
            },
        ];
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outcomePath);

        const files: ManagedOutcomeProjectFileOperations = {
            mkdir: (directory, options) => fs.promises.mkdir(directory, options),
            writeFile: async (filePath, data, encoding) => {
                if (failure === "write") throw new Error("injected disk failure");
                await fs.promises.writeFile(filePath, data, encoding);
            },
            rename: async (oldPath, newPath) => {
                if (failure === "rename") throw new Error("injected rename failure");
                await fs.promises.rename(oldPath, newPath);
            },
            remove: (filePath, options) => fs.promises.rm(filePath, options),
            readFile: (filePath, encoding) => fs.promises.readFile(filePath, encoding),
        };

        try {
            const service = new ManagedOutcomeProjectService(undefined, undefined, files);
            await expect(service.registerAndOpen(blueprintPath, outcomePath, compatibility)).rejects.toThrow(/injected/);

            const registryDir = path.join(workDir, ".pokie");
            expect(fs.existsSync(path.join(registryDir, "managed-outcome-projects.json"))).toBe(false);
            expect(fs.existsSync(registryDir) ? fs.readdirSync(registryDir).filter((entry) => entry.endsWith(".tmp")) : []).toEqual([]);
            await expect(service.findCompatible(blueprintPath, compatibility)).resolves.toBeUndefined();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
