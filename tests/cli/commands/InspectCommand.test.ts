import {PokieProject, ProjectResolving} from "pokie";
import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {InspectCommand} from "../../../cli/commands/InspectCommand.js";

function createStubResolver(project: PokieProject | undefined): ProjectResolving & {calledWith?: string} {
    return {
        resolve(projectPath: string) {
            this.calledWith = projectPath;
            return Promise.resolve(project);
        },
    };
}

function projectOf(type: PokieProject["type"], rootPath = "./hand-written"): PokieProject {
    return {type, rootPath, capabilities: [], provenance: "test fixture"} as PokieProject;
}

const validProject = projectOf("tsPackage");
const blueprintProject = projectOf("blueprint", "./game.blueprint.json");
const outcomeProject = projectOf("outcomeLibrary", "./outcomes");
const parWorkbookProject = projectOf("parWorkbook", "./game.par.xlsx");
const stakeProject = projectOf("stakeAdapter", "./stake-export");
const wasmProject = projectOf("wasm", "./game.wasm");

const SAMPLE_BLUEPRINT = {
    manifest: {id: "sample", name: "Sample", version: "1.0.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "B", "C"],
    paytable: {A: {3: 5}},
};

describe("InspectCommand", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("has the expected name and description", () => {
        const command = new InspectCommand(createStubResolver(validProject));

        expect(command.getName()).toBe("inspect");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new InspectCommand(createStubResolver(validProject));

        await expect(command.run([])).rejects.toThrow(/Usage: pokie inspect <packageRoot>/);
    });

    it("throws a descriptive error for an unexpected extra argument", async () => {
        const command = new InspectCommand(createStubResolver(validProject));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("passes the given packageRoot to the inspector", async () => {
        const resolver = createStubResolver(validProject);
        const command = new InspectCommand(resolver);

        await command.run(["./hand-written"]);

        expect(resolver.calledWith).toBe("./hand-written");
    });

    it("prints a package's public kind and runnable next actions", async () => {
        const command = new InspectCommand(createStubResolver(validProject));

        const exitCode = await command.run(["./hand-written"]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Inspecting POKIE game package at "./hand-written"');
        expect(printed).toContain("Available next actions:");
        expect(printed).toContain("Validate the game:");
        expect(printed).toContain('pokie sim "./hand-written" --rounds 10000 --seed demo');
        expect(printed).not.toContain("runtime.execute");
    });

    it("explains unsupported input concisely in public project terminology", async () => {
        const command = new InspectCommand(createStubResolver(undefined));

        const exitCode = await command.run(["./missing"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(
            '"./missing" is not a supported POKIE project. Choose a Game Blueprint, POKIE game package, Outcome Library, Stake Engine export, PAR workbook, or compatible WASM component.',
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it.each([
        [blueprintProject, "Game Blueprint", "Build a POKIE game package", "first build a POKIE game package"],
        [outcomeProject, "Outcome Library", "Simulate outcome draws", "original game logic"],
        [stakeProject, "Stake Engine export", "Inspect exact outcome statistics", "use the compatible Outcome Library"],
        [parWorkbookProject, "PAR workbook", "Import a Game Blueprint", "first import the workbook"],
        [wasmProject, "POKIE WASM component", "Inspect this component", "cannot build, run, simulate, or validate WASM game logic"],
    ])("explains the public kind, compatible actions, and prerequisites for %s", async (project, kind, action, prerequisite) => {
        const command = new InspectCommand(createStubResolver(project));

        expect(await command.run([project.rootPath])).toBe(0);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain(kind);
        expect(printed).toContain(action);
        expect(printed).toContain(prerequisite);
        expect(printed).not.toContain("capability");
    });
});

describe("InspectCommand (integration, real GamePackageInspector)", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("inspects a real package built by the current \"pokie build\" and prints runnable next actions", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-inspect-workflow-test-"));
        const outDir = path.join(workDir, "built-game");
        const blueprintPath = path.join(__dirname, "..", "..", "..", "examples", "blueprints", "sample-slot.blueprint.json");
        try {
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", outDir]);
            expect(buildExitCode).toBe(0);
            logSpy.mockClear();

            const command = new InspectCommand();
            const exitCode = await command.run([outDir]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("POKIE game package");
            expect(printed).toContain("Validate the game:");
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("inspects a real hand-written package and returns 0 with its public kind", async () => {
        const packageRoot = path.join(__dirname, "..", "..", "gamepackage", "fixtures", "valid-game");
        const command = new InspectCommand();

        const exitCode = await command.run([packageRoot]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("POKIE game package");
    });

    it("returns 1 for a missing package root", async () => {
        const command = new InspectCommand();

        const exitCode = await command.run([path.join(os.tmpdir(), "definitely-does-not-exist-pokie-inspect")]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalled();
    });

    it("identifies every fresh public project kind and explains malformed project metadata", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-inspect-project-kinds-test-"));
        const blueprintPath = path.join(workDir, "sample.blueprint.json");
        const packageDir = path.join(workDir, "game-package");
        const outcomeDir = path.join(workDir, "outcomes");
        const stakeDir = path.join(workDir, "stake-export");
        const workbookPath = path.join(workDir, "game.par.xlsx");
        const wasmPath = path.join(workDir, "game.wasm");
        const malformedPackageDir = path.join(workDir, "malformed-package");
        fs.writeFileSync(blueprintPath, JSON.stringify(SAMPLE_BLUEPRINT));
        fs.mkdirSync(packageDir);
        fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({name: "game", pokie: {entry: "./index.js"}}));
        fs.mkdirSync(outcomeDir);
        fs.writeFileSync(
            path.join(outcomeDir, "manifest.json"),
            JSON.stringify({
                schemaVersion: 1,
                generatedBy: "pokie outcomelibrary build",
                pokieVersion: "1.3.0",
                generatedAt: new Date(0).toISOString(),
                game: {id: "sample", name: "Sample", version: "1.0.0"},
                artifactPokieVersion: "1.3.0",
                modes: [],
                files: ["manifest.json"],
            }),
        );
        fs.mkdirSync(stakeDir);
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify({generatedBy: "pokie stakeengine export", generatedAt: new Date(0).toISOString()}));
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        workbook.addWorksheet("Symbols");
        workbook.addWorksheet("Paytable");
        await workbook.xlsx.writeFile(workbookPath);
        fs.writeFileSync(wasmPath, "not real WASM bytes");
        fs.writeFileSync(
            `${wasmPath}.pokie-wasm.json`,
            JSON.stringify({
                schemaVersion: "1.0.0",
                component: {id: "sample-component", version: "0.1.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            }),
        );
        fs.mkdirSync(malformedPackageDir);
        fs.writeFileSync(path.join(malformedPackageDir, "package.json"), "{not valid json");

        try {
            const command = new InspectCommand();
            for (const [projectPath, kind] of [
                [blueprintPath, "Game Blueprint"],
                [packageDir, "POKIE game package"],
                [outcomeDir, "Outcome Library"],
                [stakeDir, "Stake Engine export"],
                [workbookPath, "PAR workbook"],
                [wasmPath, "POKIE WASM component"],
            ]) {
                expect(await command.run([projectPath])).toBe(0);
                expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain(kind);
                logSpy.mockClear();
            }

            expect(await command.run([malformedPackageDir])).toBe(1);
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("project metadata is malformed");
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("ProjectTarget");
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
