import {
    CertificationEvidenceBundleBuildResult,
    CertificationEvidenceBundleModeSampleInput,
    CertificationEvidenceVerifyOptions,
    ValidationIssue,
} from "pokie";
import {CertificationCommand} from "../../../cli/commands/CertificationCommand.js";

const CONFIG_PATH = "/project/certification-config.json";

function createStubJsonStore(entries: Record<string, unknown>): (filePath: string) => unknown {
    return (filePath: string) => {
        if (!(filePath in entries)) {
            throw new Error(`no stub JSON for "${filePath}"`);
        }
        return entries[filePath];
    };
}

function createStubBuilder(result: CertificationEvidenceBundleBuildResult): {
    calledWith?: {bundleDir: string; modes: readonly CertificationEvidenceBundleModeSampleInput[]; outDir: string};
    buildFromBundle(bundleDir: string, modes: readonly CertificationEvidenceBundleModeSampleInput[], outDir: string): Promise<CertificationEvidenceBundleBuildResult>;
} {
    return {
        buildFromBundle(bundleDir: string, modes: readonly CertificationEvidenceBundleModeSampleInput[], outDir: string) {
            this.calledWith = {bundleDir, modes, outDir};
            return Promise.resolve(result);
        },
    };
}

function createStubVerifier(issues: ValidationIssue[]): {
    calledWith?: {certDir: string; options?: CertificationEvidenceVerifyOptions};
    verify(certDir: string, options?: CertificationEvidenceVerifyOptions): Promise<ValidationIssue[]>;
} {
    return {
        verify(certDir: string, options?: CertificationEvidenceVerifyOptions) {
            this.calledWith = {certDir, options};
            return Promise.resolve(issues);
        },
    };
}

const descriptor = {
    modes: [{modeName: "base", seed: "cert-seed-1", sampleCount: 50}],
};

const successResult: CertificationEvidenceBundleBuildResult = {
    outDir: "/project/certification",
    files: ["samples_base.jsonl", "manifest.json"],
    manifest: undefined,
    issues: [],
};

describe("CertificationCommand", () => {
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
        const command = new CertificationCommand("1.3.0", createStubBuilder(successResult));

        expect(command.getName()).toBe("certification");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new CertificationCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie certification build/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new CertificationCommand("1.3.0");

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie certification build/);
    });

    describe("build", () => {
        it("loads the descriptor and writes to the default --out dir", async () => {
            const builder = createStubBuilder(successResult);
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", builder, undefined, loadJson);

            const exitCode = await command.run(["build", "/project/bundle", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(builder.calledWith?.bundleDir).toBe("/project/bundle");
            expect(builder.calledWith?.outDir).toBe("/project/certification");
            expect(builder.calledWith?.modes).toEqual([{modeName: "base", seed: "cert-seed-1", sampleCount: 50}]);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Built a certification/evidence bundle");
            for (const file of successResult.files) {
                expect(printed).toContain(file);
            }
        });

        it("honors a custom --out path", async () => {
            const builder = createStubBuilder(successResult);
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", builder, undefined, loadJson);

            await command.run(["build", "/project/bundle", CONFIG_PATH, "--out", "/custom/out"]);

            expect(builder.calledWith?.outDir).toBe("/custom/out");
        });

        it("prints an error summary and returns 1 when the builder reports error-level issues", async () => {
            const failureResult: CertificationEvidenceBundleBuildResult = {
                outDir: "/project/certification",
                files: [],
                manifest: undefined,
                issues: [{code: "certification-evidence-build-mode-not-found-in-bundle", severity: "error", message: "boom"}],
            };
            const builder = createStubBuilder(failureResult);
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", builder, undefined, loadJson);

            const exitCode = await command.run(["build", "/project/bundle", CONFIG_PATH]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("certification-evidence-build-mode-not-found-in-bundle");
        });

        it("prints warnings alongside a success line when the builder reports only warnings", async () => {
            const warningResult: CertificationEvidenceBundleBuildResult = {
                ...successResult,
                issues: [{code: "certification-evidence-build-stale-cleanup-failed", severity: "warning", message: "clean me up"}],
            };
            const builder = createStubBuilder(warningResult);
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", builder, undefined, loadJson);

            const exitCode = await command.run(["build", "/project/bundle", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(logSpy.mock.calls.flat().join("\n")).toContain("clean me up");
        });

        it("throws a descriptive error when bundleDir or config path is missing", async () => {
            const command = new CertificationCommand("1.3.0", createStubBuilder(successResult));

            await expect(command.run(["build", "/project/bundle"])).rejects.toThrow(/Usage: pokie certification build/);
            await expect(command.run(["build"])).rejects.toThrow(/Usage: pokie certification build/);
        });

        it("throws on --out with no value", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", createStubBuilder(successResult), undefined, loadJson);

            await expect(command.run(["build", "/project/bundle", CONFIG_PATH, "--out"])).rejects.toThrow(/--out requires a directory path/);
        });

        it("throws on an unknown option", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new CertificationCommand("1.3.0", createStubBuilder(successResult), undefined, loadJson);

            await expect(command.run(["build", "/project/bundle", CONFIG_PATH, "--bogus"])).rejects.toThrow(/Unknown option/);
        });

        it("throws a descriptive error when the descriptor JSON has no modes array", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {}});
            const command = new CertificationCommand("1.3.0", createStubBuilder(successResult), undefined, loadJson);

            await expect(command.run(["build", "/project/bundle", CONFIG_PATH])).rejects.toThrow(/is not a valid certification bundle config/);
        });

        it("throws a descriptive error when a mode entry is malformed", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {modes: [{modeName: "base"}]}});
            const command = new CertificationCommand("1.3.0", createStubBuilder(successResult), undefined, loadJson);

            await expect(command.run(["build", "/project/bundle", CONFIG_PATH])).rejects.toThrow(/must be an object with a string "modeName"\/"seed"/);
        });
    });

    describe("verify", () => {
        it("verifies the given certification directory and prints a success line when there are no issues", async () => {
            const verifier = createStubVerifier([]);
            const command = new CertificationCommand("1.3.0", undefined, verifier);

            const exitCode = await command.run(["verify", "/project/certification"]);

            expect(exitCode).toBe(0);
            expect(verifier.calledWith).toEqual({certDir: "/project/certification", options: {sourceBundleDir: undefined}});
            expect(logSpy.mock.calls.flat().join("\n")).toContain("verified successfully");
        });

        it("passes --source through to the verifier", async () => {
            const verifier = createStubVerifier([]);
            const command = new CertificationCommand("1.3.0", undefined, verifier);

            await command.run(["verify", "/project/certification", "--source", "/project/bundle"]);

            expect(verifier.calledWith?.options).toEqual({sourceBundleDir: "/project/bundle"});
        });

        it("prints an error summary and returns 1 when the verifier reports error-level issues", async () => {
            const verifier = createStubVerifier([{code: "certification-evidence-verify-sample-outcome-changed", severity: "error", message: "boom"}]);
            const command = new CertificationCommand("1.3.0", undefined, verifier);

            const exitCode = await command.run(["verify", "/project/certification"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("certification-evidence-verify-sample-outcome-changed");
        });

        it("throws a descriptive error when no certDir is given", async () => {
            const command = new CertificationCommand("1.3.0");

            await expect(command.run(["verify"])).rejects.toThrow(/Usage: pokie certification verify/);
        });

        it("throws on an unknown option", async () => {
            const command = new CertificationCommand("1.3.0");

            await expect(command.run(["verify", "/project/certification", "--bogus"])).rejects.toThrow(/Unknown option/);
        });
    });
});
