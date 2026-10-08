import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleReader, StakeEngineImporter, WinEvaluationResult, buildRoundArtifact, buildWeightedOutcomeLibrary} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ImportCommand} from "../../cli/commands/ImportCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

const blueprint = {
    manifest: {id: "export-conflict", name: "Export Conflict", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["B", "A"]],
};

type OutcomeProvenanceOverrides = Partial<{gameId: string; gameVersion: string; configHash: string; pokieVersion: string}>;

function validOutcomeLibrary(provenance: OutcomeProvenanceOverrides = {}) {
    return buildWeightedOutcomeLibrary({
        libraryId: "export-library",
        outcomes: [
            {
                id: "0",
                weight: 1,
                artifact: buildRoundArtifact({
                    roundId: "export-round",
                    provenance: {
                        game: {id: provenance.gameId ?? "export-game", name: "Export Game", version: provenance.gameVersion ?? "1.0.0"},
                        ...(provenance.configHash !== undefined ? {configHash: provenance.configHash} : {}),
                        pokieVersion: provenance.pokieVersion ?? "1.3.0",
                    },
                    betMode: "base",
                    stake: 1,
                    steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult()}],
                }),
            },
        ],
    });
}

function writeValidSources(workDir: string): Record<"outcomeLibrary" | "stakeAdapter" | "parWorkbook", string> {
    const libraryPath = path.join(workDir, "library.json");
    const outcomesPath = path.join(workDir, "outcomes.json");
    const adapterPath = path.join(workDir, "adapter.json");
    const workbookPath = path.join(workDir, "source.blueprint.json");
    fs.writeFileSync(libraryPath, JSON.stringify(validOutcomeLibrary()));
    fs.writeFileSync(outcomesPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "./library.json"}]}));
    fs.writeFileSync(adapterPath, JSON.stringify({modes: [{modeName: "base", cost: 1, libraryPath: "./library.json"}]}));
    fs.writeFileSync(workbookPath, JSON.stringify(blueprint));
    return {outcomeLibrary: outcomesPath, stakeAdapter: adapterPath, parWorkbook: workbookPath};
}

describe("BuildCommand", () => {
    it("exposes one canonical build command and handles help without exporting", async () => {
        const command = new BuildCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["--help"])).resolves.toBe(0);
        expect(command.getName()).toBe("build");
        expect(command.getCommanderCommand().name()).toBe("build");

        logSpy.mockRestore();
    });

    it("forwards workbook output conflicts and resolved Blueprint aliases without changing their files", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-conflict-test-"));
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const outputPath = path.join(workDir, "occupied.par.xlsx");
        const linkedDir = `${workDir}-link`;
        const sourceContents = JSON.stringify(blueprint, null, 4);
        const outputBytes = Buffer.from("existing generic export output");
        const command = new BuildCommand("1.3.0");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(blueprintPath, sourceContents);
            fs.writeFileSync(outputPath, outputBytes);

            await expect(command.run([blueprintPath, "--target", "parWorkbook", "--out", outputPath])).rejects.toThrow(
                /Cannot build target "parWorkbook"[\s\S]*Next: choose a different --out path/i,
            );
            expect(fs.readFileSync(outputPath)).toEqual(outputBytes);

            fs.symlinkSync(workDir, linkedDir, "dir");
            await expect(command.run([blueprintPath, "--target", "parWorkbook", "--out", path.join(linkedDir, "source.blueprint.json")])).rejects.toThrow(
                /Cannot build target "parWorkbook"[\s\S]*Next: choose a different --out path/i,
            );
            expect(fs.readFileSync(blueprintPath, "utf-8")).toBe(sourceContents);
        } finally {
            errorSpy.mockRestore();
            if (fs.existsSync(linkedDir)) fs.unlinkSync(linkedDir);
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("builds a Blueprint Project to a Stake Engine adapter through the advertised target", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-blueprint-adapter-test-"));
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const adapterPath = path.join(workDir, "stakeAdapter");
        const command = new BuildCommand("1.3.0");

        try {
            fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

            await expect(command.run([blueprintPath, "--target", "stakeAdapter", "--out", adapterPath])).resolves.toBe(0);

            expect(fs.existsSync(path.join(adapterPath, "pokie-manifest.json"))).toBe(true);
            expect(fs.existsSync(path.join(adapterPath, "index.json"))).toBe(true);
            await expect(new ValidateCommand().run([adapterPath, "--format", "json"])).resolves.toBe(0);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("publishes PAR-derived outcomes through a missing explicit parent", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-par-parent-test-"));
        const workbookPath = path.join(workDir, "source.xlsx");
        const outcomePath = path.join(workDir, "missing", "outcomeLibrary", "library");
        const command = new BuildCommand("1.3.0");

        try {
            fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            await expect(command.run([workbookPath, "--target", "outcomeLibrary", "--out", outcomePath])).resolves.toBe(0);
            expect(fs.existsSync(path.join(outcomePath, "manifest.json"))).toBe(true);
            expect(fs.existsSync(path.join(outcomePath, ".pokie", "par-import", "conversion-evidence.json"))).toBe(true);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("keeps a large Blueprint build usable by recording deterministic bounded coverage before the Stake hand-off", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-large-blueprint-test-"));
        const blueprintPath = path.join(workDir, "large.blueprint.json");
        const outcomePath = path.join(workDir, "outcomeLibrary");
        const adapterPath = path.join(workDir, "stakeAdapter");
        const command = new BuildCommand("1.3.0");
        const strip = ["A", "B", "C", "D", "E", "A", "C", "E", "B", "D", "A", "D", "B", "E", "C"];

        try {
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "large-export", name: "Large Export", version: "1.0.0"},
                    reels: 5,
                    rows: 4,
                    symbols: ["A", "B", "C", "D", "E"],
                    paytable: {A: {3: 1, 4: 2, 5: 3}, B: {3: 1, 4: 2, 5: 3}, C: {3: 1, 4: 2, 5: 3}, D: {3: 1, 4: 2, 5: 3}, E: {3: 1, 4: 2, 5: 3}},
                    // 15^5 raw stop tuples crosses the managed exact planning limit. The distinct
                    // four-row windows exercise the large artifact path a random five-reel Blueprint uses.
                    reelStrips: Array.from({length: 5}, (_unused, reel) =>
                        strip.map((_symbol, index) => strip[(index + reel) % strip.length]),
                    ),
                    availableBets: [1],
                }),
            );

            await expect(command.run([blueprintPath, "--target", "outcomeLibrary", "--out", outcomePath])).resolves.toBe(0);
            const outcomeManifest = JSON.parse(fs.readFileSync(path.join(outcomePath, "manifest.json"), "utf-8")) as {
                modes: Array<{generator: {strategy: string; totalOutcomeSpaceSize: number; sampledRawCount: number; seed?: string}}>;
            };
            expect(outcomeManifest.modes).toEqual([
                expect.objectContaining({
                    generator: expect.objectContaining({
                        strategy: "bounded-coverage",
                        totalOutcomeSpaceSize: 759_375,
                        sampledRawCount: 5_000,
                        seed: expect.stringMatching(/^pokie-managed-coverage:sha256:/),
                    }),
                }),
            ]);
            await expect(new ValidateCommand().run([outcomePath, "--format", "json"])).resolves.toBe(0);

            await expect(command.run([blueprintPath, "--target", "stakeAdapter", "--out", adapterPath])).resolves.toBe(0);
            expect(fs.existsSync(path.join(adapterPath, "pokie-manifest.json"))).toBe(true);
            await expect(new ValidateCommand().run([adapterPath, "--format", "json"])).resolves.toBe(0);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("previews every build target from its valid source without writing and rejects every occupied alias destination", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-lifecycle-test-"));
        const sourcePath = path.join(workDir, "source.blueprint.json");
        const command = new BuildCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
            const validSources = writeValidSources(workDir);
            for (const target of ["outcomeLibrary", "stakeAdapter", "parWorkbook"] as const) {
                const extension = target === "parWorkbook" ? ".xlsx" : "";
                const dryRunDestination = path.join(workDir, `${target}-dry-run${extension}`);
                await expect(command.run([validSources[target], "--target", target, "--out", dryRunDestination, "--dry-run"])).resolves.toBe(0);
                expect(fs.existsSync(dryRunDestination)).toBe(false);

                const occupiedDestination = path.join(workDir, `${target}-occupied${extension}`);
                if (target === "parWorkbook") {
                    fs.writeFileSync(occupiedDestination, "sentinel");
                } else {
                    fs.mkdirSync(occupiedDestination);
                    fs.writeFileSync(path.join(occupiedDestination, "sentinel.txt"), "sentinel");
                }
                await expect(command.run([validSources[target], "--target", target, "--out", occupiedDestination, "--dry-run"])).rejects.toThrow(
                    new RegExp(`Cannot build target "${target}"[\\s\\S]*Next: choose a different --out path`),
                );
                await expect(command.run([sourcePath, "--target", target, "--out", occupiedDestination])).rejects.toThrow(
                    new RegExp(`Cannot build target "${target}"[\\s\\S]*Next: choose a different --out path`),
                );
                if (target === "parWorkbook") {
                    expect(fs.readFileSync(occupiedDestination, "utf-8")).toBe("sentinel");
                } else {
                    expect(fs.readFileSync(path.join(occupiedDestination, "sentinel.txt"), "utf-8")).toBe("sentinel");
                }
            }
        } finally {
            logSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it.each(["outcomeLibrary", "stakeAdapter", "parWorkbook"] as const)("rejects a missing dry-run source for %s without writing", async (target) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-missing-source-test-"));
        const destination = path.join(workDir, `${target}-destination`);
        const command = new BuildCommand("1.3.0");

        try {
            await expect(command.run([path.join(workDir, "missing.json"), "--target", target, "--out", destination, "--dry-run"])).rejects.toThrow(
                /ENOENT|Could not read/i,
            );
            expect(fs.existsSync(destination)).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it.each(["outcomeLibrary", "stakeAdapter", "parWorkbook"] as const)("rejects malformed and incompatible dry-run sources for %s without writing", async (target) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-invalid-source-test-"));
        const malformedSource = path.join(workDir, "malformed.json");
        const destination = path.join(workDir, `${target}-destination`);
        const command = new BuildCommand("1.3.0");

        try {
            fs.writeFileSync(malformedSource, "{not valid json");
            const validSources = writeValidSources(workDir);
            const incompatibleSource = validSources.outcomeLibrary;
            if (target === "parWorkbook") {
                fs.writeFileSync(destination, "sentinel");
            } else {
                fs.mkdirSync(destination);
                fs.writeFileSync(path.join(destination, "sentinel.txt"), "sentinel");
            }
            // An adapter descriptor is also a valid Outcome Library descriptor (its extra `cost`
            // field is intentionally ignored), and every Blueprint is now a supported source for all
            // advertised targets. Keep the incompatible-source assertion only where the contracts differ.
            const invalidSources = target === "outcomeLibrary" ? [malformedSource] : [malformedSource, incompatibleSource];
            for (const source of invalidSources) {
                const error = await command.run([source, "--target", target, "--out", destination, "--dry-run"]).catch((failure: unknown) => failure);
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).not.toMatch(new RegExp(`Cannot build target "${target}" because source[\\s\\S]*not compatible`, "i"));
                expect((error as Error).message).not.toMatch(/\n\s*at /i);
                if (target === "parWorkbook") {
                    expect(fs.readFileSync(destination, "utf-8")).toBe("sentinel");
                } else {
                    expect(fs.readFileSync(path.join(destination, "sentinel.txt"), "utf-8")).toBe("sentinel");
                }
            }
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("preserves a prepared descriptor drift diagnostic instead of replacing it with source compatibility text", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-drift-test-"));
        const sourcePath = path.join(workDir, "outcomes.json");
        const libraryPath = path.join(workDir, "library.json");
        const destination = path.join(workDir, "outcomeLibrary");
        const command = new BuildCommand("1.3.0");
        const original = OutcomeLibraryCommand.prototype.prepareDescriptorBuildOperation;
        const prepareSpy = jest.spyOn(OutcomeLibraryCommand.prototype, "prepareDescriptorBuildOperation").mockImplementation(function (this: OutcomeLibraryCommand, configPath, outDir, signal) {
            const prepared = Reflect.apply(original, this, [configPath, outDir, signal]);
            return {
                ...prepared,
                execution: {
                    ...prepared.execution,
                    read: () => {
                        const read = prepared.execution.read();
                        fs.writeFileSync(configPath, `${fs.readFileSync(configPath, "utf-8")}\n`);
                        return read;
                    },
                },
            };
        });

        try {
            fs.writeFileSync(libraryPath, JSON.stringify(validOutcomeLibrary()));
            fs.writeFileSync(sourcePath, JSON.stringify({modes: [{modeName: "base", libraryPath: "./library.json"}]}));

            await expect(command.run([sourcePath, "--target", "outcomeLibrary", "--out", destination])).rejects.toThrow(
                /conversion source changed after this operation was prepared/i,
            );
            expect(fs.existsSync(destination)).toBe(false);
        } finally {
            prepareSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("keeps a descriptor build's late caller-owned Outcome destination intact and retries after removal", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-late-destination-test-"));
        const sourcePath = path.join(workDir, "outcomes.json");
        const libraryPath = path.join(workDir, "library.json");
        const destination = path.join(workDir, "outcomeLibrary");
        const command = new BuildCommand("1.3.0");
        const original = OutcomeLibraryCommand.prototype.prepareDescriptorBuildOperation;
        let claimDestination = true;
        const prepareSpy = jest.spyOn(OutcomeLibraryCommand.prototype, "prepareDescriptorBuildOperation").mockImplementation(function (this: OutcomeLibraryCommand, configPath, outDir, signal) {
            const prepared = Reflect.apply(original, this, [configPath, outDir, signal]);
            return {
                ...prepared,
                execution: {
                    ...prepared.execution,
                    publish: (modes) => {
                        if (claimDestination) {
                            fs.mkdirSync(outDir);
                            fs.writeFileSync(path.join(outDir, "caller-owned.txt"), "untouched");
                        }
                        return prepared.execution.publish(modes);
                    },
                },
            };
        });

        try {
            fs.writeFileSync(libraryPath, JSON.stringify(validOutcomeLibrary()));
            fs.writeFileSync(sourcePath, JSON.stringify({modes: [{modeName: "base", libraryPath: "./library.json"}]}));

            await expect(command.run([sourcePath, "--target", "outcomeLibrary", "--out", destination])).rejects.toThrow(/destination is unavailable|already exists/i);
            expect(fs.readFileSync(path.join(destination, "caller-owned.txt"), "utf-8")).toBe("untouched");
            expect(fs.readdirSync(workDir).filter((entry) => entry.startsWith("outcomes.staging-") || entry.startsWith("outcomes.tmp-"))).toEqual([]);

            fs.rmSync(destination, {recursive: true, force: true});
            claimDestination = false;
            await expect(command.run([sourcePath, "--target", "outcomeLibrary", "--out", destination])).resolves.toBe(0);
        } finally {
            prepareSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it.each<readonly [string, OutcomeProvenanceOverrides]>([
        ["game id", {gameId: "other-export-game"}],
        ["game version", {gameVersion: "2.0.0"}],
        ["config hash", {configHash: "other-config"}],
        ["POKIE version", {pokieVersion: "2.0.0"}],
    ])("rejects an outcomes dry-run whose individually valid libraries disagree on %s", async (_provenanceField, incompatibleProvenance) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-provenance-test-"));
        const baseLibraryPath = path.join(workDir, "base.json");
        const bonusLibraryPath = path.join(workDir, "bonus.json");
        const sourcePath = path.join(workDir, "outcomes.json");
        const dryRunDestination = path.join(workDir, "outcomes-dry-run");
        const buildDestination = path.join(workDir, "outcomes-build");
        const buildCommand = new BuildCommand("1.3.0");
        const outcomeLibraryCommand = new OutcomeLibraryCommand("1.3.0");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(baseLibraryPath, JSON.stringify(validOutcomeLibrary({configHash: "base-config"})));
            fs.writeFileSync(bonusLibraryPath, JSON.stringify(validOutcomeLibrary({...incompatibleProvenance, configHash: incompatibleProvenance.configHash ?? "base-config"})));
            fs.writeFileSync(sourcePath, JSON.stringify({
                modes: [
                    {modeName: "base", libraryPath: "./base.json"},
                    {modeName: "bonus", libraryPath: "./bonus.json"},
                ],
            }));

            const dryRunError = await buildCommand.run([sourcePath, "--target", "outcomeLibrary", "--out", dryRunDestination, "--dry-run"])
                .catch((failure: unknown) => failure);
            expect(dryRunError).toBeInstanceOf(Error);
            expect((dryRunError as Error).message).toMatch(/The outcome-library source does not satisfy the export contract: [\s\S]+Next: fix the listed source errors/i);
            expect((dryRunError as Error).message).not.toMatch(/Cannot build target "outcomeLibrary" because source[\s\S]*not compatible|OutcomeLibraryBundleWriter|registry|ENOENT|\n\s*at /i);
            expect(fs.existsSync(dryRunDestination)).toBe(false);
            expect(fs.readdirSync(workDir)).not.toEqual(expect.arrayContaining([expect.stringMatching(/outcomes-dry-run\.staging-/)]));

            await expect(outcomeLibraryCommand.run(["build", sourcePath, "--out", buildDestination])).resolves.toBe(1);
            expect(fs.existsSync(buildDestination)).toBe(false);
            expect(fs.readdirSync(workDir)).not.toEqual(expect.arrayContaining([expect.stringMatching(/outcomes-build\.staging-/)]));
        } finally {
            errorSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
    it("publishes both relative Outcome descriptor modes and reads the canonical bundles", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-descriptor-modes-"));
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const library = validOutcomeLibrary();
            fs.writeFileSync(path.join(directory, "library.json"), JSON.stringify(library));
            fs.writeFileSync(path.join(directory, "outcomes.jsonl"), library.outcomes.map((outcome) => JSON.stringify(outcome)).join("\n") + "\n");
            const source = path.join(directory, "descriptor.json");
            fs.writeFileSync(source, JSON.stringify({modes: [
                {modeName: "base", libraryPath: "./library.json"},
                {modeName: "streamed", outcomesPath: "./outcomes.jsonl", libraryId: library.libraryId},
            ]}));
            const command = new BuildCommand("1.3.0");
            const destination = path.join(directory, "outcomeLibrary");
            expect(await command.run([source, "--target", "outcomeLibrary", "--dry-run"])).toBe(0);
            expect(fs.existsSync(destination)).toBe(false);
            expect(await command.run([source, "--target", "outcomeLibrary"])).toBe(0);
            const manifest = await new OutcomeLibraryBundleReader().readManifest(destination);
            expect(manifest.modes.map((mode) => mode.modeName)).toEqual(["base", "streamed"]);
            expect(await new ValidateCommand().run([destination, "--deep", "--format", "json"])).toBe(0);
        } finally {
            log.mockRestore();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("retains Stake library and bundle descriptors, cost, generator metadata and imported provenance on canonical rebuild", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-stake-descriptors-"));
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const sources = writeValidSources(directory);
            const command = new BuildCommand("1.3.0");
            const adapter = path.join(directory, "stakeAdapter");
            expect(await command.run([sources.stakeAdapter, "--target", "stakeAdapter"])).toBe(0);
            expect((await new StakeEngineImporter().importFromDirectory(adapter)).modes).toHaveLength(1);
            const generatedAdapter = path.join(directory, "generated-adapter");
            expect(await command.run([sources.parWorkbook, "--target", "stakeAdapter", "--out", generatedAdapter])).toBe(0);
            const imported = path.join(directory, "imported");
            expect(await new ImportCommand("1.3.0").run([generatedAdapter, "--out", imported])).toBe(0);
            // Import's config uses a bundleDir relative to its own directory, carries the
            // generator and original source hashes, and is a real accepted descriptor.
            const importedConfigPath = path.join(imported, "config.json");
            const importedConfig = JSON.parse(fs.readFileSync(importedConfigPath, "utf8"));
            importedConfig.modes[0].cost = 2;
            fs.writeFileSync(importedConfigPath, JSON.stringify(importedConfig));
            const preview = path.join(directory, "preview");
            expect(await command.run([importedConfigPath, "--target", "stakeAdapter", "--out", preview, "--dry-run"])).toBe(0);
            expect(fs.existsSync(preview)).toBe(false);
            const rebuilt = path.join(directory, "rebuilt");
            expect(await command.run([path.join(imported, "config.json"), "--target", "stakeAdapter", "--out", rebuilt])).toBe(0);
            const config = JSON.parse(fs.readFileSync(path.join(imported, "config.json"), "utf8"));
            const manifest = JSON.parse(fs.readFileSync(path.join(rebuilt, "pokie-manifest.json"), "utf8"));
            expect(manifest.sourceProvenance).toEqual(config.sourceProvenance);
            expect(manifest.modes[0].cost).toBe(2);
            expect(manifest.modes[0].generator).toEqual(config.modes[0].generator);
        } finally {
            log.mockRestore();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it.each(["success", "failure", "cancellation"] as const)("forwards SIGINT and removes the descriptor listener on %s", async (terminal) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-descriptor-cancel-"));
        const source = writeValidSources(directory).outcomeLibrary;
        const destination = path.join(directory, "result");
        const initialListeners = process.listenerCount("SIGINT");
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const original = OutcomeLibraryCommand.prototype.prepareDescriptorBuildOperation;
        let observedSignal: AbortSignal | undefined;
        const prepare = jest.spyOn(OutcomeLibraryCommand.prototype, "prepareDescriptorBuildOperation").mockImplementation(function (this: OutcomeLibraryCommand, configPath, outDir, signal) {
            observedSignal = signal;
            const prepared = Reflect.apply(original, this, [configPath, outDir, signal]);
            return {...prepared, execution: {...prepared.execution, read: () => {
                if (terminal === "cancellation") process.emit("SIGINT");
                if (terminal === "failure") throw new Error("reader failed after preparation");
                return prepared.execution.read();
            }}};
        });
        try {
            const run = new BuildCommand("1.3.0").run([source, "--target", "outcomeLibrary", "--out", destination]);
            if (terminal === "success") await expect(run).resolves.toBe(0);
            else await expect(run).rejects.toThrow(terminal === "failure" ? /reader failed/ : /cancelled/);
            expect(observedSignal).toBeDefined();
            expect(observedSignal!.aborted).toBe(terminal === "cancellation");
            expect(process.listenerCount("SIGINT")).toBe(initialListeners);
            expect(fs.existsSync(destination)).toBe(terminal === "success");
            if (terminal !== "success") expect(log.mock.calls.flat().join("\n")).not.toMatch(/Artifact .* built in/);
            expect(fs.readdirSync(directory).filter((entry) => (/staging-|tmp-/).test(entry))).toEqual([]);
        } finally {
            prepare.mockRestore();
            log.mockRestore();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("preserves resolver failures without invoking descriptor fallback", async () => {
        const failure = new Error("ambiguous or malformed project boundary");
        const prepare = jest.spyOn(OutcomeLibraryCommand.prototype, "prepareDescriptorBuildOperation");
        try {
            const command = new BuildCommand("1.3.0", undefined, undefined, {resolve: () => Promise.reject(failure)});
            await expect(command.run(["broken.json", "--target", "outcomeLibrary"])).rejects.toBe(failure);
            expect(prepare).not.toHaveBeenCalled();
        } finally {
            prepare.mockRestore();
        }
    });

});
