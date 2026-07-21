import {
    FairnessCommitment,
    FairnessCommitmentInput,
    FairnessRoundProof,
    FairnessServerSeedCommitment,
    FairnessServerSeedCommitmentInput,
    FairnessVerifyOptions,
    OutcomeLibraryBundleModeIndex,
    OutcomeLibraryBundleReading,
    ValidationIssue,
} from "pokie";
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

function createFileSystemStub(files: Record<string, string> = {}): {
    files: Record<string, string>;
    readTextFile: (filePath: string) => string;
    fileExists: (filePath: string) => boolean;
    writeFile: jest.Mock;
} {
    return {
        files,
        readTextFile: (filePath: string) => {
            if (!(filePath in files)) {
                throw new Error(`no stub file for "${filePath}"`);
            }
            return files[filePath];
        },
        fileExists: (filePath: string) => filePath in files,
        writeFile: jest.fn(),
    };
}

function createStubReader(index: OutcomeLibraryBundleModeIndex): OutcomeLibraryBundleReading & {calledWith?: {bundleDir: string; modeName: string}} {
    return {
        calledWith: undefined,
        readManifest: () => Promise.reject(new Error("readManifest should never be called")),
        readModeIndex(bundleDir: string, modeName: string) {
            this.calledWith = {bundleDir, modeName};
            return Promise.resolve(index);
        },
        iterateModeOutcomes: () => {
            throw new Error("iterateModeOutcomes should never be called");
        },
        readOutcomeById: () => Promise.reject(new Error("readOutcomeById should never be called")),
        drawOutcome: () => Promise.reject(new Error("drawOutcome should never be called")),
        readLibrary: () => Promise.reject(new Error("readLibrary should never be called")),
    };
}

const STUB_MODE_INDEX: OutcomeLibraryBundleModeIndex = {
    schemaVersion: 2,
    modeName: "base",
    libraryId: "base-lib",
    librarySchemaVersion: 1,
    libraryHash: `sha256:${"a".repeat(64)}`,
    outcomeCount: 1,
    totalWeight: 1,
    outcomesFile: "outcomes_base.jsonl",
    entries: [{id: "0", weight: 1, byteOffset: 0, byteLength: 10, recordHash: `sha256:${"b".repeat(64)}`}],
};

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

    describe("seed-commit", () => {
        const SEED_PATH = "/project/serverSeed.txt";
        const serverSeedCommitment: FairnessServerSeedCommitment = {
            schemaVersion: 1,
            algorithmVersion: "pokie-fairness-hmac-sha256-v1",
            serverSeedHash: `sha256:${"c".repeat(64)}`,
            issuedAt: "2026-01-01T00:00:00.000Z",
        };

        function createCommand(
            fs: ReturnType<typeof createFileSystemStub>,
            computeServerSeedCommitment: (input: FairnessServerSeedCommitmentInput) => FairnessServerSeedCommitment = () => serverSeedCommitment,
        ) {
            return new FairnessCommand(
                createStubVerifier([]),
                createStubJsonStore({}),
                createStubReader(STUB_MODE_INDEX),
                {build: () => Promise.reject(new Error("build should never be called"))},
                computeServerSeedCommitment,
                () => {
                    throw new Error("computeCommitment should never be called");
                },
                fs.readTextFile,
                fs.fileExists,
                fs.writeFile,
            );
        }

        it("reads the server seed from the given file, computes a commitment, and prints it (never the raw seed)", async () => {
            const fs = createFileSystemStub({[SEED_PATH]: "my-secret-seed\n"});
            let seedGivenToCompute: string | undefined;
            const command = createCommand(fs, (input: FairnessServerSeedCommitmentInput) => {
                seedGivenToCompute = input.serverSeed;
                return serverSeedCommitment;
            });

            const exitCode = await command.run(["seed-commit", SEED_PATH]);

            expect(exitCode).toBe(0);
            expect(seedGivenToCompute).toBe("my-secret-seed");
            const printed = logSpy.mock.calls.flat().join("\n");
            expect(printed).toContain(serverSeedCommitment.serverSeedHash);
            expect(printed).not.toContain("my-secret-seed");
        });

        it("writes the commitment to --out and confirms it, without leaking the raw seed into the file", async () => {
            const fs = createFileSystemStub({[SEED_PATH]: "my-secret-seed"});
            const command = createCommand(fs);

            const exitCode = await command.run(["seed-commit", SEED_PATH, "--out", "/project/seed-commitment.json"]);

            expect(exitCode).toBe(0);
            expect(fs.writeFile).toHaveBeenCalledWith("/project/seed-commitment.json", `${JSON.stringify(serverSeedCommitment, null, 4)}\n`);
            const written = fs.writeFile.mock.calls[0][1] as string;
            expect(written).not.toContain("my-secret-seed");
        });

        it("refuses to overwrite an existing --out file without --overwrite", async () => {
            const fs = createFileSystemStub({[SEED_PATH]: "seed", "/project/seed-commitment.json": "{}"});
            const command = createCommand(fs);

            await expect(command.run(["seed-commit", SEED_PATH, "--out", "/project/seed-commitment.json"])).rejects.toThrow(
                /already exists.*--overwrite/,
            );
            expect(fs.writeFile).not.toHaveBeenCalled();
        });

        it("overwrites an existing --out file when --overwrite is given", async () => {
            const fs = createFileSystemStub({[SEED_PATH]: "seed", "/project/seed-commitment.json": "{}"});
            const command = createCommand(fs);

            const exitCode = await command.run(["seed-commit", SEED_PATH, "--out", "/project/seed-commitment.json", "--overwrite"]);

            expect(exitCode).toBe(0);
            expect(fs.writeFile).toHaveBeenCalled();
        });

        it("throws a usage error when no server seed file is given", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(command.run(["seed-commit"])).rejects.toThrow(/Usage: pokie fairness seed-commit/);
        });

        it("throws on an unknown option", async () => {
            const fs = createFileSystemStub({[SEED_PATH]: "seed"});
            const command = createCommand(fs);

            await expect(command.run(["seed-commit", SEED_PATH, "--bogus"])).rejects.toThrow(/Unknown option/);
        });
    });

    describe("commit", () => {
        const SERVER_SEED_COMMITMENT_PATH = "/project/seed-commitment.json";
        const serverSeedCommitmentDocument = {serverSeedHash: `sha256:${"c".repeat(64)}`};
        const roundCommitment: FairnessCommitment = {
            schemaVersion: 1,
            algorithmVersion: "pokie-fairness-hmac-sha256-v1",
            serverSeedHash: `sha256:${"c".repeat(64)}`,
            clientSeed: "player-seed",
            nonce: 0,
            libraryId: STUB_MODE_INDEX.libraryId,
            libraryHash: STUB_MODE_INDEX.libraryHash,
            modeName: "base",
            issuedAt: "2026-01-01T00:00:00.000Z",
        };

        function createCommand(
            fs: ReturnType<typeof createFileSystemStub>,
            reader = createStubReader(STUB_MODE_INDEX),
            computeCommitment: (input: FairnessCommitmentInput) => FairnessCommitment = () => roundCommitment,
        ) {
            return new FairnessCommand(
                createStubVerifier([]),
                createStubJsonStore({[SERVER_SEED_COMMITMENT_PATH]: serverSeedCommitmentDocument}),
                reader,
                {build: () => Promise.reject(new Error("build should never be called"))},
                () => {
                    throw new Error("computeServerSeedCommitment should never be called");
                },
                computeCommitment,
                fs.readTextFile,
                fs.fileExists,
                fs.writeFile,
            );
        }

        const BASE_ARGS = [SERVER_SEED_COMMITMENT_PATH, "--client-seed", "player-seed", "--nonce", "0", "--source", "/project/bundle", "--mode", "base"];

        it("derives libraryId/libraryHash from the live bundle's own mode index and builds a round commitment", async () => {
            const fs = createFileSystemStub();
            const reader = createStubReader(STUB_MODE_INDEX);
            let computeInput: FairnessCommitmentInput | undefined;
            const command = createCommand(fs, reader, (input) => {
                computeInput = input;
                return roundCommitment;
            });

            const exitCode = await command.run(["commit", ...BASE_ARGS]);

            expect(exitCode).toBe(0);
            expect(reader.calledWith).toEqual({bundleDir: "/project/bundle", modeName: "base"});
            expect(computeInput).toMatchObject({
                serverSeedCommitment: serverSeedCommitmentDocument,
                clientSeed: "player-seed",
                nonce: 0,
                libraryId: STUB_MODE_INDEX.libraryId,
                libraryHash: STUB_MODE_INDEX.libraryHash,
                modeName: "base",
            });
        });

        it("rejects an unrecognized --library-hash option (no alternative source of truth for the library hash)", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(command.run(["commit", ...BASE_ARGS, "--library-hash", "sha256:deadbeef"])).rejects.toThrow(/Unknown option "--library-hash"/);
        });

        it("throws a clear error for an unknown mode (bundle reader failure)", async () => {
            const fs = createFileSystemStub();
            const reader: OutcomeLibraryBundleReading = {
                ...createStubReader(STUB_MODE_INDEX),
                readModeIndex: () => Promise.reject(new Error("ENOENT: no such file or directory")),
            };
            const command = createCommand(fs, reader);

            await expect(command.run(["commit", ...BASE_ARGS.slice(0, -1), "bogus-mode"])).rejects.toThrow(
                /could not read mode "bogus-mode".*ENOENT/,
            );
        });

        it("throws a usage error for a malformed --nonce", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(
                command.run(["commit", SERVER_SEED_COMMITMENT_PATH, "--client-seed", "seed", "--nonce", "not-a-number", "--source", "/bundle", "--mode", "base"]),
            ).rejects.toThrow(/--nonce must be a non-negative integer/);
        });

        it("throws a usage error for a negative --nonce", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(
                command.run(["commit", SERVER_SEED_COMMITMENT_PATH, "--client-seed", "seed", "--nonce", "-1", "--source", "/bundle", "--mode", "base"]),
            ).rejects.toThrow(/--nonce must be a non-negative integer/);
        });

        it("throws a descriptive error when --mode is omitted", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(
                command.run(["commit", SERVER_SEED_COMMITMENT_PATH, "--client-seed", "seed", "--nonce", "0", "--source", "/bundle"]),
            ).rejects.toThrow(/--mode <modeName> is required/);
        });

        it("propagates malformed input JSON from the server-seed commitment file", async () => {
            const fs = createFileSystemStub();
            const command = new FairnessCommand(
                createStubVerifier([]),
                () => {
                    throw new SyntaxError("Unexpected token in JSON");
                },
                createStubReader(STUB_MODE_INDEX),
                {build: () => Promise.reject(new Error("build should never be called"))},
                () => {
                    throw new Error("should never be called");
                },
                () => roundCommitment,
                fs.readTextFile,
                fs.fileExists,
                fs.writeFile,
            );

            await expect(command.run(["commit", ...BASE_ARGS])).rejects.toThrow(SyntaxError);
        });

        it("refuses to overwrite an existing --out file without --overwrite", async () => {
            const fs = createFileSystemStub({"/project/commitment.json": "{}"});
            const command = createCommand(fs);

            await expect(command.run(["commit", ...BASE_ARGS, "--out", "/project/commitment.json"])).rejects.toThrow(/already exists.*--overwrite/);
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("reveal", () => {
        const COMMITMENT_JSON_PATH = "/project/commitment.json";
        const SERVER_SEED_PATH = "/project/serverSeed.txt";
        const commitmentDoc = {clientSeed: "player-seed", nonce: 0};
        const roundProof: FairnessRoundProof = {
            schemaVersion: 1,
            algorithmVersion: "pokie-fairness-hmac-sha256-v1",
            serverSeed: "revealed-seed",
            serverSeedHash: `sha256:${"c".repeat(64)}`,
            clientSeed: "player-seed",
            nonce: 0,
            libraryId: "base-lib",
            libraryHash: `sha256:${"a".repeat(64)}`,
            modeName: "base",
            indexHash: `sha256:${"d".repeat(64)}`,
            outcomeId: "0",
            weight: 1,
            recordHash: `sha256:${"b".repeat(64)}`,
            commitmentHash: `sha256:${"e".repeat(64)}`,
            revealedAt: "2026-01-01T00:00:00.000Z",
        };

        function createCommand(
            fs: ReturnType<typeof createFileSystemStub>,
            build: (commitment: unknown, serverSeed: string, sourceBundleDir: string) => Promise<FairnessRoundProof> = () => Promise.resolve(roundProof),
        ) {
            return new FairnessCommand(
                createStubVerifier([]),
                createStubJsonStore({[COMMITMENT_JSON_PATH]: commitmentDoc}),
                createStubReader(STUB_MODE_INDEX),
                {build},
                () => {
                    throw new Error("should never be called");
                },
                () => {
                    throw new Error("should never be called");
                },
                fs.readTextFile,
                fs.fileExists,
                fs.writeFile,
            );
        }

        it("builds a round proof via FairnessRoundProofBuilding.build and prints it", async () => {
            const fs = createFileSystemStub({[SERVER_SEED_PATH]: "revealed-seed\n"});
            let buildArgs: unknown[] = [];
            const command = createCommand(fs, (commitment, serverSeed, sourceBundleDir) => {
                buildArgs = [commitment, serverSeed, sourceBundleDir];
                return Promise.resolve(roundProof);
            });

            const exitCode = await command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH, "--source", "/project/bundle"]);

            expect(exitCode).toBe(0);
            expect(buildArgs).toEqual([commitmentDoc, "revealed-seed", "/project/bundle"]);
            expect(logSpy.mock.calls.flat().join("\n")).toContain(roundProof.outcomeId);
        });

        it("propagates a wrong revealed server seed as a build error", async () => {
            const fs = createFileSystemStub({[SERVER_SEED_PATH]: "wrong-seed"});
            const command = createCommand(fs, () => Promise.reject(new Error("the revealed serverSeed hashes to ..., not this commitment's own recorded serverSeedHash ...")));

            await expect(
                command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH, "--source", "/project/bundle"]),
            ).rejects.toThrow(/revealed serverSeed/);
        });

        it("propagates a tampered/invalid commitment as a build error", async () => {
            const fs = createFileSystemStub({[SERVER_SEED_PATH]: "seed"});
            const command = createCommand(fs, () => Promise.reject(new Error("the given commitment does not validate: fairness-commitment-malformed.")));

            await expect(
                command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH, "--source", "/project/bundle"]),
            ).rejects.toThrow(/commitment does not validate/);
        });

        it("propagates a bundle-drift/mismatch error from the builder", async () => {
            const fs = createFileSystemStub({[SERVER_SEED_PATH]: "seed"});
            const command = createCommand(fs, () => Promise.reject(new Error("the source bundle has drifted since this round was played")));

            await expect(
                command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH, "--source", "/project/bundle"]),
            ).rejects.toThrow(/drifted/);
        });

        it("throws a descriptive error when --server-seed is omitted", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(command.run(["reveal", COMMITMENT_JSON_PATH, "--source", "/project/bundle"])).rejects.toThrow(
                /--server-seed <file> is required/,
            );
        });

        it("throws a descriptive error when --source is omitted", async () => {
            const fs = createFileSystemStub();
            const command = createCommand(fs);

            await expect(command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH])).rejects.toThrow(
                /--source <bundleDir> is required/,
            );
        });

        it("refuses to overwrite an existing --out file without --overwrite", async () => {
            const fs = createFileSystemStub({[SERVER_SEED_PATH]: "revealed-seed", "/project/proof.json": "{}"});
            const command = createCommand(fs);

            await expect(
                command.run(["reveal", COMMITMENT_JSON_PATH, "--server-seed", SERVER_SEED_PATH, "--source", "/project/bundle", "--out", "/project/proof.json"]),
            ).rejects.toThrow(/already exists.*--overwrite/);
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });
});
