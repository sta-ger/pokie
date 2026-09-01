import {GameBlueprint} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CertificationCommand} from "../../cli/commands/CertificationCommand.js";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";

// One bounded, on-disk CLI lifecycle over a genuine game package. It deliberately connects the public command
// outputs instead of fabricating any library, evidence, commitment, or proof JSON: blueprint -> package ->
// sampled library -> bundle -> inspect/sample -> engineering evidence -> commit/reveal proof. The two corruption
// checks use copies only after the successful lifecycle has completed, so they prove verification rather than
// becoming an alternative way to create an artifact.
describe("CLI lifecycle (integration): game -> outcome library -> engineering evidence and Provably Fair proof", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-certification-fairness-lifecycle-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    function gameBlueprint(): GameBlueprint {
        return {
            manifest: {id: "lifecycle-cli-slot", name: "Lifecycle CLI Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 5}},
            reelStrips: [
                ["A", "A", "B"],
                ["A", "B"],
            ],
        };
    }

    function lastLogJson(): Record<string, unknown> {
        const calls = (console.log as jest.Mock).mock.calls;
        return JSON.parse(String(calls[calls.length - 1][0])) as Record<string, unknown>;
    }

    it("builds reproducible engineering evidence and a verified commit-reveal proof from public command outputs", async () => {
        const blueprintPath = path.join(workDir, "game.blueprint.json");
        const packageDir = path.join(workDir, "package");
        const libraryPath = path.join(workDir, "sampled-library.json");
        const bundleConfigPath = path.join(workDir, "bundle-config.json");
        const bundleDir = path.join(workDir, "bundle");
        const simulationPath = path.join(workDir, "simulation.json");
        const replayPath = path.join(workDir, "replay.json");
        const certificationConfigPath = path.join(workDir, "certification-config.json");
        const certificationDir = path.join(workDir, "engineering-evidence");
        const repeatCertificationDir = path.join(workDir, "engineering-evidence-repeat");
        const serverSeedPath = path.join(workDir, "server-seed.txt");
        const seedCommitmentPath = path.join(workDir, "server-seed-commitment.json");
        const commitmentPath = path.join(workDir, "round-commitment.json");
        const proofPath = path.join(workDir, "round-proof.json");

        fs.writeFileSync(blueprintPath, JSON.stringify(gameBlueprint()), "utf-8");
        expect(await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", packageDir])).toBe(0);

        // A sampled library exercises the package runtime's bounded deterministic generation path, not a
        // hand-written WeightedOutcomeLibrary. Its generated file is directly consumed by the bundle command.
        expect(
            await new OutcomeLibraryCommand("1.3.0").run([
                "generate",
                packageDir,
                "--sample",
                "12",
                "--seed",
                "library-sampling-seed",
                "--out",
                libraryPath,
                "--format",
                "json",
            ]),
        ).toBe(0);
        fs.writeFileSync(bundleConfigPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "sampled-library.json"}]}), "utf-8");
        expect(await new OutcomeLibraryCommand("1.3.0").run(["build", bundleConfigPath, "--out", bundleDir])).toBe(0);
        expect(await new OutcomeLibraryCommand("1.3.0").run(["validate", bundleDir, "--deep"])).toBe(0);

        // Persisted downstream products must bind the *same* generated bundle
        // mode, rather than merely being produced in the same temporary root.
        // This is the portable/exact replay boundary: outcome-source replay
        // records the library identity/hash while package replay has no such
        // durable outcome-source binding.
        await new SimCommand().run([
            bundleDir, "--mode", "base", "--rounds", "4", "--seed", "simulation-source-seed", "--out", simulationPath,
        ]);
        await new ReplayCommand().run([
            bundleDir, "--mode", "base", "--round", "1", "--seed", "replay-source-seed", "--out", replayPath,
        ]);
        const bundleManifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; modes: Array<{libraryId: string; libraryHash: string}>;
        };
        const sourceMode = bundleManifest.modes[0];
        const simulation = JSON.parse(fs.readFileSync(simulationPath, "utf-8")) as {
            libraryId: string; libraryHash: string; lastReplay: {game: {id: string; version: string}; libraryId: string; libraryHash: string};
        };
        const replay = JSON.parse(fs.readFileSync(replayPath, "utf-8")) as {
            game: {id: string; version: string}; outcomeSource: {libraryId: string; libraryHash: string; selectionAlgorithm: string};
        };
        expect(simulation).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, lastReplay: {
            game: bundleManifest.game, libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash,
        }});
        expect(replay).toMatchObject({game: bundleManifest.game, outcomeSource: {
            libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, selectionAlgorithm: "derived-round-seed-v1",
        }});

        // The outcome-source commands consume the just-built native bundle: inspect supplies its exact analysis,
        // while two seeded samples demonstrate the portable draw/replay claim is deterministic.
        expect(await new OutcomeSourceCommand().run(["inspect", bundleDir])).toBe(0);
        const logCalls = (console.log as jest.Mock).mock.calls;
        expect(String(logCalls[logCalls.length - 1]?.[0])).toContain("Exact analysis");
        expect(await new OutcomeSourceCommand().run(["sample", bundleDir, "--mode", "base", "--seed", "downstream-sample-seed"])).toBe(0);
        const firstSample = lastLogJson();
        expect(await new OutcomeSourceCommand().run(["sample", bundleDir, "--mode", "base", "--seed", "downstream-sample-seed"])).toBe(0);
        const repeatedSample = lastLogJson();
        expect(repeatedSample.outcomeId).toBe(firstSample.outcomeId);
        expect(repeatedSample.artifact).toEqual(firstSample.artifact);

        fs.writeFileSync(certificationConfigPath, JSON.stringify({modes: [{modeName: "base", seed: "evidence-sample-seed", sampleCount: 6}]}), "utf-8");
        const certification = new CertificationCommand("1.3.0");
        expect(await certification.run(["build", bundleDir, certificationConfigPath, "--out", certificationDir])).toBe(0);
        expect(await certification.run(["verify", certificationDir, "--source", bundleDir])).toBe(0);
        expect(await certification.run(["build", bundleDir, certificationConfigPath, "--out", repeatCertificationDir])).toBe(0);

        const evidenceManifest = JSON.parse(fs.readFileSync(path.join(certificationDir, "manifest.json"), "utf-8")) as {
            evidenceContentHash: string; game: {id: string; version: string}; modes: Array<{libraryId: string; libraryHash: string}>; sourceBundleManifestHash: string;
        };
        const repeatedEvidenceManifest = JSON.parse(fs.readFileSync(path.join(repeatCertificationDir, "manifest.json"), "utf-8")) as {
            evidenceContentHash: string;
        };
        expect(repeatedEvidenceManifest.evidenceContentHash).toBe(evidenceManifest.evidenceContentHash);
        expect(evidenceManifest).toMatchObject({game: bundleManifest.game, modes: [{
            libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash,
        }]});
        expect(evidenceManifest.sourceBundleManifestHash).toMatch(/^sha256:/);
        expect(fs.readFileSync(path.join(repeatCertificationDir, "samples_base.jsonl"), "utf-8")).toBe(
            fs.readFileSync(path.join(certificationDir, "samples_base.jsonl"), "utf-8"),
        );

        fs.writeFileSync(serverSeedPath, "lifecycle-server-seed-1234567890\n", "utf-8");
        const fairness = new FairnessCommand();
        expect(await fairness.run(["seed-commit", serverSeedPath, "--out", seedCommitmentPath])).toBe(0);
        expect(
            await fairness.run([
                "commit",
                seedCommitmentPath,
                "--client-seed",
                "player-lifecycle-seed",
                "--nonce",
                "7",
                "--source",
                bundleDir,
                "--mode",
                "base",
                "--out",
                commitmentPath,
            ]),
        ).toBe(0);
        expect(await fairness.run(["reveal", commitmentPath, "--server-seed", serverSeedPath, "--source", bundleDir, "--out", proofPath])).toBe(0);
        expect(await fairness.run(["verify", proofPath, "--commitment", commitmentPath, "--source", bundleDir])).toBe(0);

        const tamperedEvidenceDir = path.join(workDir, "tampered-engineering-evidence");
        fs.cpSync(certificationDir, tamperedEvidenceDir, {recursive: true});
        fs.appendFileSync(path.join(tamperedEvidenceDir, "samples_base.jsonl"), "corrupted evidence\n", "utf-8");
        expect(await certification.run(["verify", tamperedEvidenceDir, "--source", bundleDir])).toBe(1);
        expect((console.error as jest.Mock).mock.calls.flat().join("\n")).toContain("certification-evidence-bundle-samples-hash-mismatch");

        const staleBundleDir = path.join(workDir, "stale-bundle");
        fs.cpSync(bundleDir, staleBundleDir, {recursive: true});
        const staleManifestPath = path.join(staleBundleDir, "manifest.json");
        const staleManifest = JSON.parse(fs.readFileSync(staleManifestPath, "utf-8")) as {generatedAt: string};
        fs.writeFileSync(staleManifestPath, JSON.stringify({...staleManifest, generatedAt: "2000-01-01T00:00:00.000Z"}), "utf-8");
        expect(await certification.run(["verify", certificationDir, "--source", staleBundleDir])).toBe(1);
        expect((console.error as jest.Mock).mock.calls.flat().join("\n")).toContain("certification-evidence-verify-source-bundle-manifest-changed");

        const tamperedProofPath = path.join(workDir, "tampered-round-proof.json");
        const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8")) as {serverSeed: string; libraryId: string; libraryHash: string; modeName: string; indexHash: string};
        expect(proof).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, modeName: "base"});
        expect(proof.indexHash).toMatch(/^sha256:/);
        fs.writeFileSync(tamperedProofPath, JSON.stringify({...proof, serverSeed: "different-server-seed"}), "utf-8");
        expect(await fairness.run(["verify", tamperedProofPath, "--commitment", commitmentPath, "--source", bundleDir])).toBe(1);
        expect((console.error as jest.Mock).mock.calls.flat().join("\n")).toContain("fairness-round-proof-server-seed-mismatch");
    });
});
