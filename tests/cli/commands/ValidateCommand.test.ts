import {OutcomeLibraryBundleModeIndex, OutcomeLibraryBundleWriter, PokieGamePackageValidating, PokieGamePackageValidationReport, PokieGamePackageValidator} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function createStubValidator(report: PokieGamePackageValidationReport): PokieGamePackageValidating & {calledWith?: string} {
    return {
        validate(packageRoot: string) {
            this.calledWith = packageRoot;
            return Promise.resolve(report);
        },
    };
}

const validReport: PokieGamePackageValidationReport = {
    packageRoot: "./sample-slot",
    valid: true,
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    errors: [],
    warnings: [],
    suggestions: [],
};

const invalidReport: PokieGamePackageValidationReport = {
    packageRoot: "./broken-game",
    valid: false,
    game: null,
    errors: [{code: "pokie-game-missing-contract-methods", severity: "error", message: "does not implement PokieGame"}],
    warnings: [{code: "some-warning", severity: "warning", message: "a warning"}],
    suggestions: ["Export an object implementing PokieGame as the entry module's default export."],
};

async function writeOutcomeLibraryBundle(bundleDir: string): Promise<void> {
    await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "validate-test-library")], bundleDir);
}

function corruptOutcomeContentsWithoutChangingByteLayout(bundleDir: string): void {
    const index = JSON.parse(fs.readFileSync(path.join(bundleDir, "index_base.json"), "utf-8")) as OutcomeLibraryBundleModeIndex;
    const outcomesPath = path.join(bundleDir, "outcomes_base.jsonl");
    const bytes = fs.readFileSync(outcomesPath);
    for (const entry of index.entries) {
        bytes.fill("x".charCodeAt(0), entry.byteOffset, entry.byteOffset + entry.byteLength);
    }
    fs.writeFileSync(outcomesPath, bytes);
}

describe("ValidateCommand", () => {
    it("has the expected name and description", () => {
        const command = new ValidateCommand();

        expect(command.getName()).toBe("validate");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a project", async () => {
        const command = new ValidateCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie validate <project>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --format is not json", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
    });

    it("throws a descriptive error when --out has no value", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));

        await expect(command.run(["./game", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("prints a human-readable summary and returns exit code 0 for a valid package", async () => {
        const validator = createStubValidator(validReport);
        const command = new ValidateCommand(validator);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./sample-slot"]);

        expect(validator.calledWith).toBe("./sample-slot");
        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Validating "Sample Slot"');
        expect(printed).toContain("valid           yes");
        expect(printed).toContain("No issues found.");

        logSpy.mockRestore();
    });

    it("prints errors, warnings, and suggestions, and returns exit code 1 for an invalid package", async () => {
        const command = new ValidateCommand(createStubValidator(invalidReport));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./broken-game"]);

        expect(exitCode).toBe(1);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Validating package at");
        expect(printed).toContain("valid           no");
        expect(printed).toContain("Errors (1):");
        expect(printed).toContain("pokie-game-missing-contract-methods: The package entry does not export a usable POKIE game.");
        expect(printed).toContain("Warnings (1):");
        expect(printed).toContain("some-warning: a warning");
        expect(printed).toContain("Suggestions:");
        expect(printed).toContain('Update "package.json#pokie.entry" so it identifies the module that exports your POKIE game, then run validate again.');
        expect(printed).not.toContain("does not implement PokieGame");

        logSpy.mockRestore();
    });

    it("prints the JSON report to stdout instead of the summary when --format json is given", async () => {
        const command = new ValidateCommand(createStubValidator(validReport));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./sample-slot", "--format", "json"]);

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledTimes(1);
        const report = JSON.parse(logSpy.mock.calls[0][0]) as PokieGamePackageValidationReport & {schemaVersion: number; project: unknown};
        expect(report).toMatchObject({...validReport, schemaVersion: 1, project: {path: "./sample-slot", kind: "package"}});

        logSpy.mockRestore();
    });

    it("writes the JSON report to --out and still returns the right exit code", async () => {
        const writeFile = jest.fn();
        const command = new ValidateCommand(createStubValidator(invalidReport), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["./broken-game", "--out", "report.json"]);

        expect(exitCode).toBe(1);
        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("report.json");
        expect(JSON.parse(contents)).toMatchObject({
            schemaVersion: 1,
            project: {path: "./broken-game", kind: "package"},
            valid: false,
            errors: [expect.objectContaining({
                code: "pokie-game-missing-contract-methods",
                path: "package.json#pokie.entry",
                message: "The package entry does not export a usable POKIE game.",
            })],
            suggestions: expect.arrayContaining([
                'Update "package.json#pokie.entry" so it identifies the module that exports your POKIE game, then run validate again.',
            ]),
        });

        (console.log as jest.Mock).mockRestore();
    });
});

describe("ValidateCommand project artifacts and CI report schema", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-validate-artifact-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("validates Blueprint JSON directly, preserves math warnings, and emits a stable machine-readable report", async () => {
        const blueprintPath = path.join(outDir, "warning.blueprint.json");
        const blueprint = createStarterGameBlueprint();
        blueprint.paytable.A = {3: 10, 4: 5, 5: 20};
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        const exitCode = await new ValidateCommand().run([blueprintPath, "--format", "json"]);

        expect(exitCode).toBe(0);
        const json = (console.log as jest.Mock).mock.calls.map((call) => call[0]).find((line) => line.startsWith("{"));
        expect(json).toBeDefined();
        const report = JSON.parse(json!) as {
            schemaVersion: number;
            project: {kind: string; path: string};
            errors: unknown[];
            warnings: Array<{code: string; path: string; suggestion: string}>;
        };
        expect(report).toMatchObject({schemaVersion: 1, project: {kind: "blueprint", path: blueprintPath}, errors: []});
        expect(report.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "blueprint-paytable-non-monotonic", path: blueprintPath, suggestion: expect.any(String)}),
            ]),
        );
    });

    it("turns malformed Blueprint JSON into a location-specific diagnostic with remediation, never a parser error", async () => {
        const blueprintPath = path.join(outDir, "malformed.blueprint.json");
        fs.writeFileSync(blueprintPath, "{ not JSON");

        const exitCode = await new ValidateCommand().run([blueprintPath]);

        expect(exitCode).toBe(1);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("blueprint-file-malformed");
        expect(printed).toContain(`[${blueprintPath}]`);
        expect(printed).toContain("Next:");
        expect(printed).not.toContain("Unexpected token");
    });

    it("reports a structural Blueprint fault with its field location and remediation in the CLI JSON schema", async () => {
        const blueprintPath = path.join(outDir, "structurally-invalid.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({...createStarterGameBlueprint(), reels: 0}));

        const exitCode = await new ValidateCommand().run([blueprintPath, "--format", "json"]);

        expect(exitCode).toBe(1);
        const report = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
            schemaVersion: number;
            valid: boolean;
            project: {kind: string; path: string};
            errors: Array<{code: string; path: string; message: string; suggestion: string}>;
        };
        expect(report).toMatchObject({schemaVersion: 1, valid: false, project: {kind: "blueprint", path: blueprintPath}});
        expect(report.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "blueprint-reels-invalid",
                    path: "reels",
                    suggestion: "Fix this issue at the indicated location, then run `pokie validate <path>` again.",
                }),
            ]),
        );
    });

    it("validates malformed outcome-library bundles deeply and reports the requested deep check in JSON", async () => {
        const bundleDir = path.join(outDir, "outcomes");
        fs.mkdirSync(bundleDir);
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), "{ bad JSON");

        const exitCode = await new ValidateCommand().run([bundleDir, "--deep", "--format", "json"]);

        expect(exitCode).toBe(1);
        const json = (console.log as jest.Mock).mock.calls.map((call) => call[0]).find((line) => line.startsWith("{"));
        expect(json).toBeDefined();
        const report = JSON.parse(json!) as {
            schemaVersion: number;
            project: {kind: string};
            errors: Array<{code: string; path: string; suggestion: string; message: string}>;
            issues: unknown[];
        };
        expect(report).toMatchObject({schemaVersion: 1, deep: true, project: {kind: "outcome-library"}});
        expect(report.issues).toHaveLength(1);
        expect(report.errors[0]).toMatchObject({
            code: "outcome-library-bundle-manifest-invalid-json",
            path: "manifest.json",
            message: 'The outcome-library artifact at "manifest.json" is not valid JSON.',
            suggestion: "Repair manifest.json to match the outcome-library bundle format, then run validate again.",
        });
    });

    it("sanitizes malformed outcome index diagnostics at the CLI boundary", async () => {
        const bundleDir = path.join(outDir, "malformed-index");
        await writeOutcomeLibraryBundle(bundleDir);
        fs.writeFileSync(path.join(bundleDir, "index_base.json"), "{ not JSON");

        const exitCode = await new ValidateCommand().run([bundleDir, "--format", "json"]);

        expect(exitCode).toBe(1);
        const report = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
            schemaVersion: number;
            project: {kind: string};
            errors: Array<{code: string; path: string; message: string; suggestion: string}>;
        };
        expect(report).toMatchObject({schemaVersion: 1, project: {kind: "outcome-library"}});
        expect(report.errors).toEqual(
            expect.arrayContaining([
                {
                    code: "outcome-library-bundle-mode-index-invalid-json",
                    severity: "error",
                    path: "index_base.json",
                    message: 'The outcome-library artifact at "index_base.json" is not valid JSON.',
                    suggestion: "Repair index_base.json to match the outcome-library bundle format, then run validate again.",
                },
            ]),
        );
        expect(JSON.stringify(report)).not.toMatch(/Unexpected token|ENOENT|SyntaxError|Error:|\/index_base\.json/);
    });

    it("reports a valid outcome library consistently in shallow and deep CLI validation", async () => {
        const bundleDir = path.join(outDir, "valid-outcomes");
        await writeOutcomeLibraryBundle(bundleDir);
        const command = new ValidateCommand();

        expect(await command.run([bundleDir, "--format", "json"])).toBe(0);
        const shallow = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {schemaVersion: number; deep: boolean; valid: boolean; project: {kind: string}; errors: unknown[]; issues: unknown[]};
        expect(shallow).toMatchObject({schemaVersion: 1, deep: false, valid: true, project: {kind: "outcome-library"}, errors: [], issues: []});

        (console.log as jest.Mock).mockClear();
        expect(await command.run([bundleDir, "--deep", "--format", "json"])).toBe(0);
        const deep = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {schemaVersion: number; deep: boolean; valid: boolean; project: {kind: string}; errors: unknown[]; issues: unknown[]};
        expect(deep).toMatchObject({schemaVersion: 1, deep: true, valid: true, project: {kind: "outcome-library"}, errors: [], issues: []});
    });

    it("keeps byte-layout-only outcome corruption valid in shallow mode and safely reports it in deep mode", async () => {
        const bundleDir = path.join(outDir, "deep-corruption");
        await writeOutcomeLibraryBundle(bundleDir);
        corruptOutcomeContentsWithoutChangingByteLayout(bundleDir);
        const command = new ValidateCommand();

        expect(await command.run([bundleDir, "--format", "json"])).toBe(0);
        const shallow = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {schemaVersion: number; deep: boolean; valid: boolean; errors: unknown[]};
        expect(shallow).toMatchObject({schemaVersion: 1, deep: false, valid: true, errors: []});

        (console.log as jest.Mock).mockClear();
        expect(await command.run([bundleDir, "--deep", "--format", "json"])).toBe(1);
        const deep = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
            schemaVersion: number;
            deep: boolean;
            valid: boolean;
            errors: Array<{code: string; path: string; message: string; suggestion: string}>;
        };
        expect(deep).toMatchObject({schemaVersion: 1, deep: true, valid: false});
        expect(deep.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "outcome-library-bundle-outcomes-line-invalid-json",
                    path: "outcomes_base.jsonl",
                    suggestion: "Repair outcomes_base.jsonl to match the outcome-library bundle format, then run validate again.",
                }),
            ]),
        );
        expect(JSON.stringify(deep)).not.toMatch(/Unexpected token|ENOENT|SyntaxError|Error:/);
    });

    it("sanitizes every game package contract diagnostic with a public location and remediation", async () => {
        // Each package-validator branch starts with deliberately implementation-facing text. The CLI
        // report must instead identify an editable package artifact or manifest field and a next action.
        const cases = [
            {
                code: "pokie-game-missing-contract-methods",
                path: "package.json#pokie.entry",
                message: "The package entry does not export a usable POKIE game.",
                suggestion: 'Update "package.json#pokie.entry" so it identifies the module that exports your POKIE game, then run validate again.',
            },
            {
                code: "pokie-game-manifest-threw",
                path: "package.json#pokie.entry#manifest",
                message: "The game manifest provided by this package could not be read.",
                suggestion: "Ensure the package entry provides a manifest with non-empty id, name, and version, then run validate again.",
            },
            {
                code: "pokie-game-manifest-missing",
                path: "package.json#pokie.entry#manifest",
                message: "The package entry does not provide a game manifest.",
                suggestion: "Add a game manifest with non-empty id, name, and version to the package entry, then run validate again.",
            },
            ...(["id", "name", "version"] as const).map((field) => ({
                code: `pokie-game-manifest-invalid-${field}`,
                path: `package.json#pokie.entry#manifest.${field}`,
                message: `The game manifest field "${field}" must be a non-empty string.`,
                suggestion: `Set the game manifest field "${field}" to a non-empty string, then run validate again.`,
            })),
        ];

        for (const expected of cases) {
            const command = new ValidateCommand(
                createStubValidator({
                    ...invalidReport,
                    game: null,
                    errors: [{
                        code: expected.code,
                        severity: "error",
                        message: "PokieGame.getManifest() threw: ResolverClass failed at /private/runtime/game.ts",
                    }],
                    warnings: [],
                    suggestions: ["Export an object implementing PokieGame as the entry module's default export."],
                }),
            );

            expect(await command.run(["./broken-game", "--format", "json"])).toBe(1);
            const report = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
                schemaVersion: number;
                deep: boolean;
                valid: boolean;
                project: {kind: string; path: string};
                errors: Array<{code: string; path: string; message: string; suggestion: string}>;
            };
            expect(report).toMatchObject({
                schemaVersion: 1,
                deep: false,
                valid: false,
                project: {kind: "package", path: "./broken-game"},
                errors: [expect.objectContaining(expected)],
            });
            expect(JSON.stringify(report)).not.toMatch(/PokieGame|getManifest|ResolverClass|private\/runtime|threw:/);
            (console.log as jest.Mock).mockClear();
        }
    });

    it("reports a package entry that cannot be loaded at package.json#pokie.entry", async () => {
        const command = new ValidateCommand(
            createStubValidator({
                ...invalidReport,
                game: null,
                errors: [{code: "pokie-package-load-failed", severity: "error", message: "ENOENT: /private/missing-entry.js"}],
                warnings: [],
                suggestions: [],
            }),
        );

        expect(await command.run(["./broken-game", "--format", "json"])).toBe(1);
        const report = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
            schemaVersion: number;
            valid: boolean;
            errors: Array<{code: string; path: string; message: string; suggestion: string}>;
        };
        expect(report).toMatchObject({schemaVersion: 1, valid: false});
        expect(report.errors).toContainEqual({
            code: "pokie-package-load-failed",
            severity: "error",
            path: "package.json#pokie.entry",
            message: 'The package entry selected by "package.json#pokie.entry" could not be loaded.',
            suggestion: 'Check "pokie.entry", its target file, and installed dependencies, then run validate again.',
        });
        expect(JSON.stringify(report)).not.toMatch(/ENOENT|private|missing-entry/);
    });

    it("routes a directory without package.json through outcome-library validation", async () => {
        const bundleDir = path.join(outDir, "missing-manifest");
        fs.mkdirSync(bundleDir);

        expect(await new ValidateCommand().run([bundleDir, "--format", "json"])).toBe(1);
        const report = JSON.parse((console.log as jest.Mock).mock.calls[0][0]) as {
            schemaVersion: number;
            deep: boolean;
            valid: boolean;
            project: {kind: string; path: string};
            errors: Array<{code: string; path: string; message: string; suggestion: string}>;
            issues: unknown[];
        };
        expect(report).toMatchObject({
            schemaVersion: 1,
            deep: false,
            valid: false,
            project: {kind: "outcome-library", path: bundleDir},
            issues: expect.any(Array),
        });
        expect(report.errors).toContainEqual({
            code: "outcome-library-bundle-manifest-missing",
            severity: "error",
            path: "manifest.json",
            message: 'The outcome-library artifact at "manifest.json" is missing.',
            suggestion: "Repair manifest.json to match the outcome-library bundle format, then run validate again.",
        });
    });

    it("returns a remedial report instead of a raw materialization failure", async () => {
        const command = new ValidateCommand(
            createStubValidator(validReport),
            undefined,
            () => Promise.reject(new Error("ENOENT: internal resolver detail")),
        );

        const exitCode = await command.run(["./missing-package", "--format", "json"]);

        expect(exitCode).toBe(1);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("pokie-package-unavailable");
        expect(printed).toContain("Check package.json");
        expect(printed).not.toContain("ENOENT");
    });
});

// Proves "pokie validate" crosses the shared runtime-package-materialization boundary (see
// materializeRuntimePackage.ts) exactly once per invocation, and only ever validates against whatever
// runtime path that boundary hands back -- never the caller's own raw packageRoot -- which is also what
// lets a resolved Blueprint reach a real materialized runtime instead of a raw blueprint file.
describe("ValidateCommand runtime package materialization boundary", () => {
    it("resolves the raw packageRoot once and validates the resolved runtime path instead", async () => {
        const rawPackageRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const validator = createStubValidator(validReport);
        const command = new ValidateCommand(validator, undefined, resolveRuntimePackageRoot);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([rawPackageRoot]);

        (console.log as jest.Mock).mockRestore();
        expect(resolveCalls).toEqual([rawPackageRoot]);
        expect(validator.calledWith).toBe(resolvedRuntimePath);
    });

    it("returns a remedial validation failure when materialization cannot start, without calling the validator", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const validator = createStubValidator(validReport);
        const command = new ValidateCommand(validator, undefined, resolveRuntimePackageRoot);

        expect(await command.run(["/blueprints/raw-game.json"])).toBe(1);
        expect(validator.calledWith).toBeUndefined();
    });
});

describe("ValidateCommand (integration, real PokieGamePackageValidator + fixture packages)", () => {
    const gamepackageFixturesRoot = path.join(__dirname, "..", "..", "gamepackage", "fixtures");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-validate-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("passes a valid scaffolded-style package and returns exit code 0", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "valid-game")]);

        expect(exitCode).toBe(0);
    });

    it("fails with a clear error for a missing/invalid pokie.entry and returns exit code 1", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());
        const outFile = path.join(outDir, "report.json");

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "missing-entry-game"), "--out", outFile]);

        expect(exitCode).toBe(1);
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as PokieGamePackageValidationReport;
        expect(report.valid).toBe(false);
        expect(report.game).toBeNull();
        expect(report.errors[0].message).toContain("pokie.entry");
    });

    it("fails for an entry module that does not export a valid PokieGame and returns exit code 1", async () => {
        const command = new ValidateCommand(new PokieGamePackageValidator());

        const exitCode = await command.run([path.join(gamepackageFixturesRoot, "invalid-export-game"), "--format", "json"]);

        expect(exitCode).toBe(1);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        const report = JSON.parse(printed) as PokieGamePackageValidationReport;
        expect(report.valid).toBe(false);
        expect(report.errors[0].code).toBe("pokie-game-missing-contract-methods");
    });
});
