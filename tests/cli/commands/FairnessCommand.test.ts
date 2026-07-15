import {FairnessVerifyOptions, ValidationIssue} from "pokie";
import {FairnessCommand} from "../../../cli/commands/FairnessCommand.js";

const PROOF_PATH = "/project/proof.json";
const COMMITMENT_PATH = "/project/commitment.json";
const proofDocument = {outcomeId: "0"};
const commitmentDocument = {clientSeed: "seed"};

function createStubJsonStore(entries: Record<string, unknown>): (filePath: string) => unknown {
    return (filePath: string) => {
        if (!(filePath in entries)) {
            throw new Error(`no stub JSON for "${filePath}"`);
        }
        return entries[filePath];
    };
}

function createStubVerifier(issues: ValidationIssue[]): {
    calledWith?: {candidate: unknown; options?: FairnessVerifyOptions};
    verify(candidate: unknown, options?: FairnessVerifyOptions): Promise<ValidationIssue[]>;
} {
    return {
        verify(candidate: unknown, options?: FairnessVerifyOptions) {
            this.calledWith = {candidate, options};
            return Promise.resolve(issues);
        },
    };
}

const defaultJsonStore = createStubJsonStore({[PROOF_PATH]: proofDocument, [COMMITMENT_PATH]: commitmentDocument});

describe("FairnessCommand", () => {
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
        const command = new FairnessCommand(createStubVerifier([]));

        expect(command.getName()).toBe("fairness");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new FairnessCommand(createStubVerifier([]));

        await expect(command.run([])).rejects.toThrow(/Usage: pokie fairness verify/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new FairnessCommand(createStubVerifier([]));

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie fairness verify/);
    });

    describe("verify", () => {
        it("verifies the given proof against the given commitment/bundle and prints a success line when there are no issues", async () => {
            const verifier = createStubVerifier([]);
            const command = new FairnessCommand(verifier, defaultJsonStore);

            const exitCode = await command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source", "/project/bundle"]);

            expect(exitCode).toBe(0);
            expect(verifier.calledWith).toEqual({
                candidate: proofDocument,
                options: {commitment: commitmentDocument, sourceBundleDir: "/project/bundle"},
            });
            expect(logSpy.mock.calls.flat().join("\n")).toContain("verified successfully");
        });

        it("passes --commitment and --source through to the verifier", async () => {
            const verifier = createStubVerifier([]);
            const command = new FairnessCommand(verifier, defaultJsonStore);

            await command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source", "/project/bundle"]);

            expect(verifier.calledWith?.options).toEqual({commitment: commitmentDocument, sourceBundleDir: "/project/bundle"});
        });

        it("prints an error summary and returns 1 when the verifier reports error-level issues", async () => {
            const verifier = createStubVerifier([{code: "fairness-verify-selection-mismatch", severity: "error", message: "boom"}]);
            const command = new FairnessCommand(verifier, defaultJsonStore);

            const exitCode = await command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source", "/project/bundle"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("fairness-verify-selection-mismatch");
        });

        it("prints warnings alongside a success line when the verifier reports only warnings", async () => {
            const verifier = createStubVerifier([{code: "fairness-some-warning", severity: "warning", message: "heads up"}]);
            const command = new FairnessCommand(verifier, defaultJsonStore);

            const exitCode = await command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source", "/project/bundle"]);

            expect(exitCode).toBe(0);
            expect(logSpy.mock.calls.flat().join("\n")).toContain("heads up");
        });

        it("throws a descriptive error when no proof path is given", async () => {
            const command = new FairnessCommand(createStubVerifier([]));

            await expect(command.run(["verify"])).rejects.toThrow(/Usage: pokie fairness verify/);
        });

        it("throws a descriptive error when --commitment is omitted", async () => {
            const command = new FairnessCommand(createStubVerifier([]), defaultJsonStore);

            await expect(command.run(["verify", PROOF_PATH, "--source", "/project/bundle"])).rejects.toThrow(
                /--commitment <commitment.json> is required/,
            );
        });

        it("throws a descriptive error when --source is omitted", async () => {
            const command = new FairnessCommand(createStubVerifier([]), defaultJsonStore);

            await expect(command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH])).rejects.toThrow(/--source <bundleDir> is required/);
        });

        it("throws on --commitment with no value", async () => {
            const command = new FairnessCommand(createStubVerifier([]), defaultJsonStore);

            await expect(command.run(["verify", PROOF_PATH, "--commitment"])).rejects.toThrow(/--commitment requires a file path/);
        });

        it("throws on --source with no value", async () => {
            const command = new FairnessCommand(createStubVerifier([]), defaultJsonStore);

            await expect(command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source"])).rejects.toThrow(
                /--source requires a directory path/,
            );
        });

        it("throws on an unknown option", async () => {
            const command = new FairnessCommand(createStubVerifier([]), defaultJsonStore);

            await expect(
                command.run(["verify", PROOF_PATH, "--commitment", COMMITMENT_PATH, "--source", "/project/bundle", "--bogus"]),
            ).rejects.toThrow(/Unknown option/);
        });
    });
});
