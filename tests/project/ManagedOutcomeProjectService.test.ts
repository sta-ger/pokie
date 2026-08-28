import fs from "fs";
import os from "os";
import path from "path";
import {
    ManagedOutcomeProjectService,
    type ManagedOutcomeProjectFileOperations,
    OutcomeLibraryBundleWriter,
    type WeightedOutcomeInput,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

describe("ManagedOutcomeProjectService atomic registry writes", () => {
    it("reports a malformed managed registry as a path-aware ineligible candidate", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-malformed-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const compatibility = {gameId: "sample-slot", gameVersion: "0.1.0", configHash: "config-hash", pokieVersion: "1.3.0"};
        fs.writeFileSync(blueprintPath, "{}");
        const registryPath = path.join(workDir, ".pokie", "managed-outcome-projects.json");
        fs.mkdirSync(path.dirname(registryPath), {recursive: true});
        fs.writeFileSync(registryPath, "{not-json");

        try {
            const inspection = await new ManagedOutcomeProjectService().inspect(blueprintPath, compatibility);
            expect(inspection.project).toBeUndefined();
            expect(inspection.staleReason).toContain(registryPath);
            expect(inspection.staleReason).toMatch(/malformed|unreadable/);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it.each(["write", "rename"])("removes a temporary registry fragment and does not register a Project when %s fails", async (failure) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-registry-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomePath = path.join(workDir, "outcome");
        const compatibility = {gameId: "sample-slot", gameVersion: "0.1.0", configHash: "config-hash", pokieVersion: "1.3.0"};
        fs.writeFileSync(blueprintPath, "{}");
        const baseMode = buildOutcomeLibraryBundleModeInput("base", "base");
        // The shared fixture accepts synchronous and asynchronous sources, but this setup uses its plain-array source.
        const baseOutcomes = Array.from(baseMode.outcomes as Iterable<WeightedOutcomeInput<string>>);
        const modes = [
            {
                ...baseMode,
                outcomes: baseOutcomes.map((outcome) => ({
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

    it("rolls back a newly published record when post-publication registration rejects", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-registration-rollback-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomePath = path.join(workDir, "outcome");
        const compatibility = {gameId: "sample-slot", gameVersion: "0.1.0", configHash: "config-hash", pokieVersion: "1.3.0"};
        fs.writeFileSync(blueprintPath, "{}");
        const mode = buildOutcomeLibraryBundleModeInput("base", "base");
        const outcomes = Array.from(mode.outcomes as Iterable<WeightedOutcomeInput<string>>).map((outcome) => ({
            ...outcome,
            artifact: {...outcome.artifact, provenance: {...outcome.artifact.provenance, configHash: compatibility.configHash}},
        }));
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{...mode, outcomes}], outcomePath);

        try {
            const service = new ManagedOutcomeProjectService(undefined, () => Promise.reject(new Error("registration callback failed")));
            await expect(service.registerAndOpen(blueprintPath, outcomePath, compatibility)).rejects.toThrow(/registration callback failed/);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            await expect(service.findCompatible(blueprintPath, compatibility)).resolves.toBeUndefined();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
