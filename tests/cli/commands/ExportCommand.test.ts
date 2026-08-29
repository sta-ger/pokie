import fs from "fs";
import os from "os";
import path from "path";
import {WinEvaluationResult, buildRoundArtifact, buildWeightedOutcomeLibrary} from "pokie";
import {ExportCommand} from "../../../cli/commands/ExportCommand.js";
import {OutcomeLibraryCommand} from "../../../cli/commands/OutcomeLibraryCommand.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";

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

function writeValidSources(workDir: string): Record<"outcomes" | "adapter" | "workbook", string> {
    const libraryPath = path.join(workDir, "library.json");
    const outcomesPath = path.join(workDir, "outcomes.json");
    const adapterPath = path.join(workDir, "adapter.json");
    const workbookPath = path.join(workDir, "source.blueprint.json");
    fs.writeFileSync(libraryPath, JSON.stringify(validOutcomeLibrary()));
    fs.writeFileSync(outcomesPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "./library.json"}]}));
    fs.writeFileSync(adapterPath, JSON.stringify({modes: [{modeName: "base", cost: 1, libraryPath: "./library.json"}]}));
    fs.writeFileSync(workbookPath, JSON.stringify(blueprint));
    return {outcomes: outcomesPath, adapter: adapterPath, workbook: workbookPath};
}

describe("ExportCommand", () => {
    it("exposes one target-oriented export command and handles help without exporting", async () => {
        const command = new ExportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["--help"])).resolves.toBe(0);
        expect(command.getName()).toBe("export");
        expect(command.getCommanderCommand().name()).toBe("export");

        logSpy.mockRestore();
    });

    it("forwards workbook output conflicts and resolved Blueprint aliases without changing their files", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-conflict-test-"));
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const outputPath = path.join(workDir, "occupied.par.xlsx");
        const linkedDir = `${workDir}-link`;
        const sourceContents = JSON.stringify(blueprint, null, 4);
        const outputBytes = Buffer.from("existing generic export output");
        const command = new ExportCommand("1.3.0");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(blueprintPath, sourceContents);
            fs.writeFileSync(outputPath, outputBytes);

            await expect(command.run([blueprintPath, "--to", "workbook", "--out", outputPath])).rejects.toThrow(
                /Cannot export target "workbook"[\s\S]*Next: choose a different --out path/i,
            );
            expect(fs.readFileSync(outputPath)).toEqual(outputBytes);

            fs.symlinkSync(workDir, linkedDir, "dir");
            await expect(command.run([blueprintPath, "--to", "workbook", "--out", path.join(linkedDir, "source.blueprint.json")])).rejects.toThrow(
                /Cannot export target "workbook"[\s\S]*Next: choose a different --out path/i,
            );
            expect(fs.readFileSync(blueprintPath, "utf-8")).toBe(sourceContents);
        } finally {
            errorSpy.mockRestore();
            if (fs.existsSync(linkedDir)) fs.unlinkSync(linkedDir);
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("exports a Blueprint Project to a Stake Engine adapter through the advertised target alias", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-blueprint-adapter-test-"));
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const adapterPath = path.join(workDir, "adapter");
        const command = new ExportCommand("1.3.0");

        try {
            fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

            await expect(command.run([blueprintPath, "--to", "adapter", "--out", adapterPath])).resolves.toBe(0);

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
        const outcomePath = path.join(workDir, "missing", "outcomes", "library");
        const command = new ExportCommand("1.3.0");

        try {
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            await expect(command.run([workbookPath, "--to", "outcomes", "--out", outcomePath])).resolves.toBe(0);
            expect(fs.existsSync(path.join(outcomePath, "manifest.json"))).toBe(true);
            expect(fs.existsSync(path.join(outcomePath, ".pokie", "par-import", "conversion-evidence.json"))).toBe(true);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("keeps a large Blueprint export usable by recording deterministic bounded coverage before the Stake hand-off", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-large-blueprint-test-"));
        const blueprintPath = path.join(workDir, "large.blueprint.json");
        const outcomePath = path.join(workDir, "outcomes");
        const adapterPath = path.join(workDir, "adapter");
        const command = new ExportCommand("1.3.0");
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

            await expect(command.run([blueprintPath, "--to", "outcomes", "--out", outcomePath])).resolves.toBe(0);
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

            await expect(command.run([blueprintPath, "--to", "adapter", "--out", adapterPath])).resolves.toBe(0);
            expect(fs.existsSync(path.join(adapterPath, "pokie-manifest.json"))).toBe(true);
            await expect(new ValidateCommand().run([adapterPath, "--format", "json"])).resolves.toBe(0);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("previews every export alias from its valid source without writing and rejects every occupied alias destination", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-lifecycle-test-"));
        const sourcePath = path.join(workDir, "source.blueprint.json");
        const command = new ExportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
            const validSources = writeValidSources(workDir);
            for (const target of ["outcomes", "adapter", "workbook"] as const) {
                const extension = target === "workbook" ? ".xlsx" : "";
                const dryRunDestination = path.join(workDir, `${target}-dry-run${extension}`);
                await expect(command.run([validSources[target], "--to", target, "--out", dryRunDestination, "--dry-run"])).resolves.toBe(0);
                expect(fs.existsSync(dryRunDestination)).toBe(false);

                const occupiedDestination = path.join(workDir, `${target}-occupied${extension}`);
                if (target === "workbook") {
                    fs.writeFileSync(occupiedDestination, "sentinel");
                } else {
                    fs.mkdirSync(occupiedDestination);
                    fs.writeFileSync(path.join(occupiedDestination, "sentinel.txt"), "sentinel");
                }
                await expect(command.run([validSources[target], "--to", target, "--out", occupiedDestination, "--dry-run"])).rejects.toThrow(
                    new RegExp(`Cannot export target "${target}"[\\s\\S]*Next: choose a different --out path`),
                );
                await expect(command.run([sourcePath, "--to", target, "--out", occupiedDestination])).rejects.toThrow(
                    new RegExp(`Cannot export target "${target}"[\\s\\S]*Next: choose a different --out path`),
                );
                if (target === "workbook") {
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

    it.each(["outcomes", "adapter", "workbook"] as const)("rejects a missing dry-run source for %s without writing", async (target) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-missing-source-test-"));
        const destination = path.join(workDir, `${target}-destination`);
        const command = new ExportCommand("1.3.0");

        try {
            await expect(command.run([path.join(workDir, "missing.json"), "--to", target, "--out", destination, "--dry-run"])).rejects.toThrow(
                /ENOENT|Could not read/i,
            );
            expect(fs.existsSync(destination)).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it.each(["outcomes", "adapter", "workbook"] as const)("rejects malformed and incompatible dry-run sources for %s without writing", async (target) => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-invalid-source-test-"));
        const malformedSource = path.join(workDir, "malformed.json");
        const destination = path.join(workDir, `${target}-destination`);
        const command = new ExportCommand("1.3.0");

        try {
            fs.writeFileSync(malformedSource, "{not valid json");
            const validSources = writeValidSources(workDir);
            const incompatibleSource = validSources.outcomes;
            if (target === "workbook") {
                fs.writeFileSync(destination, "sentinel");
            } else {
                fs.mkdirSync(destination);
                fs.writeFileSync(path.join(destination, "sentinel.txt"), "sentinel");
            }
            // An adapter descriptor is also a valid Outcome Library descriptor (its extra `cost`
            // field is intentionally ignored), and every Blueprint is now a supported source for all
            // advertised targets. Keep the incompatible-source assertion only where the contracts differ.
            const invalidSources = target === "outcomes" ? [malformedSource] : [malformedSource, incompatibleSource];
            for (const source of invalidSources) {
                const error = await command.run([source, "--to", target, "--out", destination, "--dry-run"]).catch((failure: unknown) => failure);
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).not.toMatch(new RegExp(`Cannot export target "${target}" because source[\\s\\S]*not compatible`, "i"));
                expect((error as Error).message).not.toMatch(/\n\s*at /i);
                if (target === "workbook") {
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
        const destination = path.join(workDir, "outcomes");
        const command = new ExportCommand("1.3.0");
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

            await expect(command.run([sourcePath, "--to", "outcomes", "--out", destination])).rejects.toThrow(
                /conversion source changed after this operation was prepared/i,
            );
            expect(fs.existsSync(destination)).toBe(false);
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
        const exportCommand = new ExportCommand("1.3.0");
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

            const dryRunError = await exportCommand.run([sourcePath, "--to", "outcomes", "--out", dryRunDestination, "--dry-run"])
                .catch((failure: unknown) => failure);
            expect(dryRunError).toBeInstanceOf(Error);
            expect((dryRunError as Error).message).toMatch(/The outcome-library source does not satisfy the export contract: [\s\S]+Next: fix the listed source errors/i);
            expect((dryRunError as Error).message).not.toMatch(/Cannot export target "outcomes" because source[\s\S]*not compatible|OutcomeLibraryBundleWriter|registry|ENOENT|\n\s*at /i);
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
});
