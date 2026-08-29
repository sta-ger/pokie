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
    it("uses complete managed policy provenance for allocation and rejects a stale bundle mode", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-policy-key-"));
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const outcomePath = path.join(workDir, "outcome");
        const compatibility = {
            gameId: "sample-slot",
            gameVersion: "0.1.0",
            configHash: "config-hash",
            pokieVersion: "1.3.0",
            generation: "sample:4:managed-seed",
            maxExactOutcomeSpaceSize: "50000",
            compatibilityPolicyVersion: "managed-v1",
        };
        fs.writeFileSync(blueprintPath, "{}");
        const mode = buildOutcomeLibraryBundleModeInput("base", "base");
        const outcomes = Array.from(mode.outcomes as Iterable<WeightedOutcomeInput<string>>).map((outcome) => ({
            ...outcome,
            artifact: {...outcome.artifact, provenance: {...outcome.artifact.provenance, configHash: compatibility.configHash}},
        }));
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{
            ...mode,
            outcomes,
            generator: {
                algorithm: "test",
                strategy: "bounded-coverage",
                totalOutcomeSpaceSize: 8,
                sampledRawCount: 4,
                seed: "managed-seed",
                pokieVersion: "1.3.0",
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                configHash: compatibility.configHash,
                maxExactOutcomeSpaceSize: 50_000,
                compatibilityPolicyVersion: "managed-v1",
                generatedAt: new Date(0).toISOString(),
            },
        }], outcomePath);

        try {
            const service = new ManagedOutcomeProjectService();
            const differentCap = {...compatibility, maxExactOutcomeSpaceSize: "50001"};
            const differentPolicy = {...compatibility, compatibilityPolicyVersion: "managed-v2"};
            const differentSample = {...compatibility, generation: "sample:5:managed-seed"};

            expect(service.allocateRoot(blueprintPath, compatibility)).not.toBe(service.allocateRoot(blueprintPath, differentCap));
            expect(service.allocateRoot(blueprintPath, compatibility)).not.toBe(service.allocateRoot(blueprintPath, differentPolicy));
            expect(service.allocateRoot(blueprintPath, compatibility)).not.toBe(service.allocateRoot(blueprintPath, differentSample));

            await expect(service.registerAndOpen(blueprintPath, outcomePath, compatibility)).resolves.toMatchObject({type: "outcomeLibrary"});
            await expect(service.findCompatible(blueprintPath, compatibility)).resolves.toMatchObject({rootPath: outcomePath});

            const manifestPath = path.join(outcomePath, "manifest.json");
            type ManagedGeneratorManifest = {modes: Array<{generator: {
                maxExactOutcomeSpaceSize: number;
                sampledRawCount: number;
                seed: string;
                compatibilityPolicyVersion: string;
            }}>};
            const originalManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ManagedGeneratorManifest;
            const staleMutations: readonly ((generator: ManagedGeneratorManifest["modes"][number]["generator"]) => void)[] = [
                (generator) => {
                    generator.maxExactOutcomeSpaceSize = 49_999;
                },
                (generator) => {
                    generator.sampledRawCount = 5;
                },
                (generator) => {
                    generator.seed = "wrong-seed";
                },
                (generator) => {
                    generator.compatibilityPolicyVersion = "managed-v2";
                },
            ];
            for (const makeStale of staleMutations) {
                const staleManifest = JSON.parse(JSON.stringify(originalManifest)) as ManagedGeneratorManifest;
                makeStale(staleManifest.modes[0].generator);
                fs.writeFileSync(manifestPath, JSON.stringify(staleManifest));
                await expect(service.findCompatible(blueprintPath, compatibility)).resolves.toBeUndefined();
            }
            await expect(service.inspect(blueprintPath, compatibility)).resolves.toEqual({
                staleReason: expect.stringMatching(/moved, corrupt, or no longer matches its manifest/),
            });
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

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

        const studioRoots = new Set<string>();
        try {
            const service = new ManagedOutcomeProjectService(
                undefined,
                (project) => {
                    studioRoots.add(project.rootPath);
                    return Promise.reject(new Error("registration callback failed"));
                },
                undefined,
                (rootPath) => {
                    studioRoots.delete(rootPath);
                    return Promise.resolve();
                },
            );
            await expect(service.registerAndOpen(blueprintPath, outcomePath, compatibility)).rejects.toThrow(/registration callback failed/);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            expect(studioRoots).toEqual(new Set());
            await expect(service.findCompatible(blueprintPath, compatibility)).resolves.toBeUndefined();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("removes the callback-owned registration when a published managed Outcome is released", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-outcome-release-callback-"));
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
        const studioRoots = new Set<string>();

        try {
            const service = new ManagedOutcomeProjectService(
                undefined,
                (project) => {
                    studioRoots.add(project.rootPath);
                    return Promise.resolve();
                },
                undefined,
                (rootPath) => {
                    studioRoots.delete(rootPath);
                    return Promise.resolve();
                },
            );
            await service.registerAndOpen(blueprintPath, outcomePath, compatibility);
            await service.release(blueprintPath, outcomePath);

            expect(studioRoots).toEqual(new Set());
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
