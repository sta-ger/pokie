import fs from "fs";
import os from "os";
import path from "path";
import {WinEvaluationResult, buildRoundArtifact, buildWeightedOutcomeLibrary} from "pokie";
import {ExportCommand} from "../../../cli/commands/ExportCommand.js";
import {OutcomeLibraryCommand} from "../../../cli/commands/OutcomeLibraryCommand.js";

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
                new RegExp(`Cannot export target "${target}" because source[\\s\\S]*Next:`),
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
            const incompatibleSource = target === "outcomes" ? validSources.workbook : validSources.outcomes;
            if (target === "workbook") {
                fs.writeFileSync(destination, "sentinel");
            } else {
                fs.mkdirSync(destination);
                fs.writeFileSync(path.join(destination, "sentinel.txt"), "sentinel");
            }
            for (const source of [malformedSource, incompatibleSource]) {
                const error = await command.run([source, "--to", target, "--out", destination, "--dry-run"]).catch((failure: unknown) => failure);
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toMatch(
                    new RegExp(`Cannot export target "${target}" because source[\\s\\S]*Next:`),
                );
                expect((error as Error).message).not.toMatch(/ENOENT|registry|filesystem/i);
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
            expect((dryRunError as Error).message).toMatch(
                /Cannot export target "outcomes" because source[\s\S]*Next: provide an outcome-library config with valid mode sources, then retry\./,
            );
            expect((dryRunError as Error).message).not.toMatch(/OutcomeLibraryBundleWriter|registry|ENOENT|\n\s*at /i);
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
