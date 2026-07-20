import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleReader} from "pokie";
import {StudioFairnessService} from "../../../../cli/studio/fairness/StudioFairnessService.js";
import {buildFairnessSourceBundle, issueFairnessCommitmentFor} from "../../../fairness/FairnessRoundProofTestFixtures.js";

describe("StudioFairnessService", () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fairness-service-"));
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    describe("configure", () => {
        it("computes both commitment artifacts against the live bundle's own libraryId/libraryHash", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const index = await new OutcomeLibraryBundleReader().readModeIndex(path.join(tmpRoot, "bundle"), "base");
            const service = new StudioFairnessService();

            const view = await service.configure(tmpRoot, {
                bundleDir: "bundle",
                modeName: "base",
                serverSeed: "operator-server-seed",
                clientSeed: "player-client-seed",
                nonce: 0,
            });

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.serverSeedCommitment.serverSeedHash).toBeDefined();
            expect(view.commitment.libraryId).toBe(index.libraryId);
            expect(view.commitment.libraryHash).toBe(index.libraryHash);
            expect(view.commitment.serverSeedHash).toBe(view.serverSeedCommitment.serverSeedHash);
        });

        it("reports load-error when the requested mode isn't in the bundle manifest", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioFairnessService();

            const view = await service.configure(tmpRoot, {
                bundleDir: "bundle",
                modeName: "bonus",
                serverSeed: "operator-server-seed",
                clientSeed: "player-client-seed",
                nonce: 0,
            });

            expect(view.status).toBe("load-error");
        });

        it("reports invalid for a request that fails the commitment's own domain rules (negative nonce)", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioFairnessService();

            const view = await service.configure(tmpRoot, {
                bundleDir: "bundle",
                modeName: "base",
                serverSeed: "operator-server-seed",
                clientSeed: "player-client-seed",
                nonce: -1,
            });

            expect(view.status).toBe("invalid");
        });

        it("reports load-error for a bundle path that resolves outside the project root", async () => {
            const service = new StudioFairnessService();

            const view = await service.configure(tmpRoot, {
                bundleDir: "../outside",
                modeName: "base",
                serverSeed: "operator-server-seed",
                clientSeed: "player-client-seed",
                nonce: 0,
            });

            expect(view.status).toBe("load-error");
        });
    });

    describe("generateProof", () => {
        it("builds a round proof against a real commitment/bundle", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();

            const view = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.proof.outcomeId).toBeDefined();
            expect(view.proof.commitmentHash).toBeDefined();
        });

        it("reports a build-error when the revealed serverSeed doesn't match the commitment", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();

            const view = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "a-different-seed"});

            expect(view.status).toBe("build-error");
            if (view.status !== "build-error") throw new Error("expected build-error");
            expect(view.code).toBeDefined();
        });

        it("reports load-error for a bundle path that resolves outside the project root", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();

            const view = await service.generateProof(tmpRoot, {bundleDir: "../outside", commitment, serverSeed: "operator-server-seed"});

            expect(view.status).toBe("load-error");
        });
    });

    describe("verify", () => {
        it("verifies a genuine proof against its commitment and live source bundle", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();
            const generated = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});
            if (generated.status !== "ok") throw new Error("expected the proof to build successfully");

            const view = await service.verify(tmpRoot, {proof: generated.proof, commitment, sourceBundleDir: "bundle"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toEqual([]);
        });

        it("reports a mismatch error for a tampered proof", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();
            const generated = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});
            if (generated.status !== "ok") throw new Error("expected the proof to build successfully");
            const tamperedProof = {...generated.proof, outcomeId: `not-${generated.proof.outcomeId}`};

            const view = await service.verify(tmpRoot, {proof: tamperedProof, commitment, sourceBundleDir: "bundle"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports fairness-verify-commitment-required when no commitment is supplied", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();
            const generated = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});
            if (generated.status !== "ok") throw new Error("expected the proof to build successfully");

            const view = await service.verify(tmpRoot, {proof: generated.proof, sourceBundleDir: "bundle"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.some((issue) => issue.code === "fairness-verify-commitment-required")).toBe(true);
        });

        it("reports fairness-verify-source-bundle-dir-required when no sourceBundleDir is supplied", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();
            const generated = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});
            if (generated.status !== "ok") throw new Error("expected the proof to build successfully");

            const view = await service.verify(tmpRoot, {proof: generated.proof, commitment});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.some((issue) => issue.code === "fairness-verify-source-bundle-dir-required")).toBe(true);
        });

        it("reports load-error for a sourceBundleDir that resolves outside the project root", async () => {
            await buildFairnessSourceBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const commitment = await issueFairnessCommitmentFor(path.join(tmpRoot, "bundle"), "base", {serverSeed: "operator-server-seed"});
            const service = new StudioFairnessService();
            const generated = await service.generateProof(tmpRoot, {bundleDir: "bundle", commitment, serverSeed: "operator-server-seed"});
            if (generated.status !== "ok") throw new Error("expected the proof to build successfully");

            const view = await service.verify(tmpRoot, {proof: generated.proof, commitment, sourceBundleDir: "../outside"});

            expect(view.status).toBe("load-error");
        });
    });
});
