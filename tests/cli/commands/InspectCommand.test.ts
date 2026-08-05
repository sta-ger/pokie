import {GamePackageInspecting, GamePackageInspectionReport, GamePackageInspector} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {InspectCommand} from "../../../cli/commands/InspectCommand.js";

function createStubInspector(report: GamePackageInspectionReport): GamePackageInspecting & {calledWith?: string} {
    return {
        inspect(packageRoot: string) {
            this.calledWith = packageRoot;
            return report;
        },
    };
}

const validReport: GamePackageInspectionReport = {
    packageRoot: "./hand-written",
    valid: true,
    packageJson: {name: "hand-written", version: "1.0.0"},
};

const invalidReport: GamePackageInspectionReport = {
    packageRoot: "./missing",
    valid: false,
    error: '"./missing" does not exist or is not a directory.',
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
        const command = new InspectCommand(createStubInspector(validReport));

        expect(command.getName()).toBe("inspect");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new InspectCommand(createStubInspector(validReport));

        await expect(command.run([])).rejects.toThrow(/Usage: pokie inspect <packageRoot>/);
    });

    it("throws a descriptive error for an unexpected extra argument", async () => {
        const command = new InspectCommand(createStubInspector(validReport));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("passes the given packageRoot to the inspector", async () => {
        const inspector = createStubInspector(validReport);
        const command = new InspectCommand(inspector);

        await command.run(["./hand-written"]);

        expect(inspector.calledWith).toBe("./hand-written");
    });

    it("prints the package.json identity and returns 0 for a valid package", async () => {
        const command = new InspectCommand(createStubInspector(validReport));

        const exitCode = await command.run(["./hand-written"]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Inspecting package at "./hand-written"');
        expect(printed).toContain('package.json     name: "hand-written", version: "1.0.0"');
    });

    it("prints the error and returns 1 for an invalid/missing package root", async () => {
        const command = new InspectCommand(createStubInspector(invalidReport));

        const exitCode = await command.run(["./missing"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(invalidReport.error);
        expect(logSpy).not.toHaveBeenCalled();
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

    it("inspects a real package built by the current \"pokie build\" and prints its package.json identity", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-inspect-workflow-test-"));
        const outDir = path.join(workDir, "built-game");
        const blueprintPath = path.join(__dirname, "..", "..", "..", "examples", "blueprints", "sample-slot.blueprint.json");
        try {
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", outDir]);
            expect(buildExitCode).toBe(0);
            logSpy.mockClear();

            const command = new InspectCommand(new GamePackageInspector());
            const exitCode = await command.run([outDir]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('package.json     name: "sample-slot", version: "0.1.0"');
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("inspects a real hand-written package and returns 0 with its package.json identity", async () => {
        const packageRoot = path.join(__dirname, "..", "..", "gamepackage", "fixtures", "valid-game");
        const command = new InspectCommand(new GamePackageInspector());

        const exitCode = await command.run([packageRoot]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('package.json     name: "valid-game", version: "1.0.0"');
    });

    it("returns 1 for a missing package root", async () => {
        const command = new InspectCommand(new GamePackageInspector());

        const exitCode = await command.run([path.join(os.tmpdir(), "definitely-does-not-exist-pokie-inspect")]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalled();
    });
});
