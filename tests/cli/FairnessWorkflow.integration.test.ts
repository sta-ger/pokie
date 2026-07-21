import {OutcomeLibraryBundleWriter} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {buildFairnessSourceBundle, FAIRNESS_TEST_POKIE_VERSION} from "../fairness/FairnessRoundProofTestFixtures.js";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

const SERVER_SEED = "e2e-server-seed-do-not-leak-1234567890abcdef";

// End-to-end happy path (and failure modes) for the full Provably Fair CLI workflow: "pokie fairness
// seed-commit" -> "pokie fairness commit" -> "pokie fairness reveal" -> "pokie fairness verify", all
// driven through the real FairnessCommand (no stubs) against a real, on-disk Outcome Library Bundle
// built by the production OutcomeLibraryBundleWriter (via buildFairnessSourceBundle — the same fixture
// tests/fairness/FairnessRoundProofBuilder.test.ts/FairnessRoundProofVerifier.test.ts already build on
// top of) — the same "no hand-crafted fixture standing in for production code" discipline
// BuildWorkflow.integration.test.ts/ParSheetRoundTrip.integration.test.ts already follow.
describe("CLI workflow (integration): pokie fairness seed-commit -> commit -> reveal -> verify", () => {
    let workDir: string;
    let bundleDir: string;
    let serverSeedPath: string;

    beforeEach(async () => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-fairness-workflow-test-"));
        bundleDir = path.join(workDir, "bundle");
        await buildFairnessSourceBundle(bundleDir, ["base"]);
        serverSeedPath = path.join(workDir, "serverSeed.txt");
        fs.writeFileSync(serverSeedPath, `${SERVER_SEED}\n`, "utf-8");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("commits, reveals, and verifies a round, producing artifacts the existing verifier accepts with no issues", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");
        const proofPath = path.join(workDir, "proof.json");

        const seedCommitExitCode = await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        expect(seedCommitExitCode).toBe(0);
        const seedCommitmentDocument = JSON.parse(fs.readFileSync(seedCommitmentPath, "utf-8"));
        expect(seedCommitmentDocument).toMatchObject({algorithmVersion: "pokie-fairness-hmac-sha256-v1"});
        expect(seedCommitmentDocument.serverSeed).toBeUndefined();

        const commitExitCode = await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);
        expect(commitExitCode).toBe(0);
        const commitmentDocument = JSON.parse(fs.readFileSync(commitmentPath, "utf-8"));
        expect(commitmentDocument.libraryId).toBe("base-lib");
        expect(commitmentDocument.serverSeed).toBeUndefined();

        const revealExitCode = await command.run(["reveal", commitmentPath, "--server-seed", serverSeedPath, "--source", bundleDir, "--out", proofPath]);
        expect(revealExitCode).toBe(0);
        const proofDocument = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
        expect(proofDocument.serverSeed).toBe(SERVER_SEED);

        const verifyExitCode = await command.run(["verify", proofPath, "--commitment", commitmentPath, "--source", bundleDir]);
        expect(verifyExitCode).toBe(0);
        expect((console.error as jest.Mock).mock.calls.length).toBe(0);
    });

    it("never writes the raw server seed into the server-seed commitment or round commitment artifacts", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");

        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);

        expect(fs.readFileSync(seedCommitmentPath, "utf-8")).not.toContain(SERVER_SEED);
        expect(fs.readFileSync(commitmentPath, "utf-8")).not.toContain(SERVER_SEED);
        expect((console.log as jest.Mock).mock.calls.flat().join("\n")).not.toContain(SERVER_SEED);
    });

    it("refuses to overwrite an existing artifact without --overwrite, and succeeds once given it", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");

        const firstExitCode = await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        expect(firstExitCode).toBe(0);
        const firstWritten = fs.readFileSync(seedCommitmentPath, "utf-8");

        await expect(command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath])).rejects.toThrow(/already exists/);
        expect(fs.readFileSync(seedCommitmentPath, "utf-8")).toBe(firstWritten);

        const overwriteExitCode = await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath, "--overwrite"]);
        expect(overwriteExitCode).toBe(0);
    });

    it("rejects a reveal whose server seed doesn't match the published commitment", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");
        const wrongSeedPath = path.join(workDir, "wrongSeed.txt");
        fs.writeFileSync(wrongSeedPath, "a-completely-different-seed", "utf-8");

        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);

        await expect(command.run(["reveal", commitmentPath, "--server-seed", wrongSeedPath, "--source", bundleDir])).rejects.toThrow(
            /revealed serverSeed hashes to/,
        );
    });

    it("rejects a reveal against a tampered (structurally invalid) commitment", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");

        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);

        const tampered = {...JSON.parse(fs.readFileSync(commitmentPath, "utf-8")), extraField: "tampered"};
        fs.writeFileSync(commitmentPath, JSON.stringify(tampered), "utf-8");

        await expect(command.run(["reveal", commitmentPath, "--server-seed", serverSeedPath, "--source", bundleDir])).rejects.toThrow(
            /commitment does not validate/,
        );
    });

    it("rejects a reveal against a changed/mismatched source bundle (different libraryId than the one committed to)", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");
        const otherBundleDir = path.join(workDir, "other-bundle");
        await new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION).writeToDirectory(
            [buildOutcomeLibraryBundleModeInput("base", "a-completely-different-library")],
            otherBundleDir,
        );

        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);

        await expect(command.run(["reveal", commitmentPath, "--server-seed", serverSeedPath, "--source", otherBundleDir])).rejects.toThrow(
            /libraryId\/libraryHash/,
        );
    });

    it("reports verify issues (non-zero exit) when the source bundle drifts after the round proof was issued", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        const commitmentPath = path.join(workDir, "commitment.json");
        const proofPath = path.join(workDir, "proof.json");

        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);
        await command.run([
            "commit",
            seedCommitmentPath,
            "--client-seed",
            "player-client-seed",
            "--nonce",
            "0",
            "--source",
            bundleDir,
            "--mode",
            "base",
            "--out",
            commitmentPath,
        ]);
        await command.run(["reveal", commitmentPath, "--server-seed", serverSeedPath, "--source", bundleDir, "--out", proofPath]);

        // The live bundle changes in place after the proof was issued — same directory, different content.
        await new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION).writeToDirectory(
            [buildOutcomeLibraryBundleModeInput("base", "base-lib-v2")],
            bundleDir,
        );

        const verifyExitCode = await command.run(["verify", proofPath, "--commitment", commitmentPath, "--source", bundleDir]);
        expect(verifyExitCode).toBe(1);
        expect((console.error as jest.Mock).mock.calls.flat().join("\n")).toContain("fairness-verify-library-mismatch");
    });

    it("rejects committing against an unknown mode with a clear error, not a raw stack trace", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);

        await expect(
            command.run(["commit", seedCommitmentPath, "--client-seed", "player-client-seed", "--nonce", "0", "--source", bundleDir, "--mode", "no-such-mode"]),
        ).rejects.toThrow(/could not read mode "no-such-mode"/);
    });

    it("rejects a malformed --nonce before ever touching the bundle or server-seed commitment", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);

        await expect(
            command.run(["commit", seedCommitmentPath, "--client-seed", "player-client-seed", "--nonce", "not-a-number", "--source", bundleDir, "--mode", "base"]),
        ).rejects.toThrow(/--nonce must be a canonical non-negative decimal integer/);
    });

    it("rejects committing against a malformed (non-JSON) server-seed commitment file", async () => {
        const command = new FairnessCommand();
        const malformedPath = path.join(workDir, "not-json.json");
        fs.writeFileSync(malformedPath, "{ not valid json", "utf-8");

        await expect(
            command.run(["commit", malformedPath, "--client-seed", "player-client-seed", "--nonce", "0", "--source", bundleDir, "--mode", "base"]),
        ).rejects.toThrow();
    });

    it("rejects an unsupported mode name on the CLI itself the same way the domain layer would (invalid characters)", async () => {
        const command = new FairnessCommand();
        const seedCommitmentPath = path.join(workDir, "seed-commitment.json");
        await command.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath]);

        await expect(
            command.run(["commit", seedCommitmentPath, "--client-seed", "player-client-seed", "--nonce", "0", "--source", bundleDir, "--mode", "../outside"]),
        ).rejects.toThrow();
    });
});
