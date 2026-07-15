import fs from "fs";
import os from "os";
import path from "path";
import {
    computeFairnessCommitment,
    FairnessCommitment,
    FairnessRoundProofBuildError,
    FairnessRoundProofBuilder,
    OutcomeLibraryBundleReader,
} from "pokie";
import {buildFairnessSourceBundle} from "./FairnessRoundProofTestFixtures.js";

describe("FairnessRoundProofBuilder", () => {
    let tmpRoot: string;
    let bundleDir: string;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-builder-"));
        bundleDir = path.join(tmpRoot, "bundle");
        await buildFairnessSourceBundle(bundleDir, ["base"]);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    async function commitmentFor(serverSeed: string, nonce = 0): Promise<FairnessCommitment> {
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        return computeFairnessCommitment({
            serverSeed,
            clientSeed: "player-client-seed",
            nonce,
            libraryId: index.libraryId,
            libraryHash: index.libraryHash,
            modeName: "base",
        });
    }

    it("builds a proof that reveals the seed and pins the mode/library/index it was drawn from", async () => {
        const serverSeed = "server-seed-1";
        const commitment = await commitmentFor(serverSeed);
        const builder = new FairnessRoundProofBuilder();

        const proof = await builder.build(commitment, serverSeed, bundleDir);

        expect(proof.serverSeed).toBe(serverSeed);
        expect(proof.serverSeedHash).toBe(commitment.serverSeedHash);
        expect(proof.clientSeed).toBe(commitment.clientSeed);
        expect(proof.nonce).toBe(commitment.nonce);
        expect(proof.libraryId).toBe(commitment.libraryId);
        expect(proof.libraryHash).toBe(commitment.libraryHash);
        expect(proof.modeName).toBe("base");
        expect(proof.outcomeId.length).toBeGreaterThan(0);
        expect(proof.weight).toBeGreaterThan(0);
        expect(proof.recordHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(proof.indexHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is deterministic — the same commitment/serverSeed/bundle always produces the exact same draw", async () => {
        const serverSeed = "server-seed-determinism";
        const commitment = await commitmentFor(serverSeed);
        const builder = new FairnessRoundProofBuilder();

        const first = await builder.build(commitment, serverSeed, bundleDir);
        const second = await builder.build(commitment, serverSeed, bundleDir);

        expect(second.outcomeId).toBe(first.outcomeId);
        expect(second.weight).toBe(first.weight);
        expect(second.recordHash).toBe(first.recordHash);
        expect(second.indexHash).toBe(first.indexHash);
    });

    it("returns a deeply frozen proof", async () => {
        const serverSeed = "server-seed-frozen";
        const commitment = await commitmentFor(serverSeed);
        const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);

        expect(Object.isFrozen(proof)).toBe(true);
        expect(() => {
            (proof as {outcomeId: string}).outcomeId = "tampered";
        }).toThrow();
    });

    it("rejects a revealed serverSeed that doesn't hash to the commitment's own serverSeedHash", async () => {
        const commitment = await commitmentFor("server-seed-committed");
        const builder = new FairnessRoundProofBuilder();

        await expect(builder.build(commitment, "a-different-seed-entirely", bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });

    it("rejects a commitment whose libraryId/libraryHash no longer matches the live bundle's own mode index", async () => {
        const serverSeed = "server-seed-3";
        const commitment = await commitmentFor(serverSeed);
        const tampered: FairnessCommitment = {...commitment, libraryHash: `sha256:${"0".repeat(64)}`};
        const builder = new FairnessRoundProofBuilder();

        await expect(builder.build(tampered, serverSeed, bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });
});
